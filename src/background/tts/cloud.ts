import { loadSecrets, type Settings } from '../../core/settings'
import { localesFor, pickVoice } from '../../core/voices'
import { cloudOrigin } from '../../core/cloudOrigins'
import { cacheKey, getCachedAudio, putCachedAudio } from './audioCache'

export interface Audio {
  mime: string
  data: ArrayBuffer
}

export interface CloudVoice {
  id: string
  name: string
  lang: string
}

export class CloudTtsError extends Error {}

const AZURE_ORIGIN = (azureRegion: string) => cloudOrigin('azure', { azureRegion })
const ELEVEN_ORIGIN = cloudOrigin('elevenlabs', { azureRegion: '' })

async function ensurePermission(origin: string) {
  if (!(await chrome.permissions.contains({ origins: [origin] }))) {
    throw new CloudTtsError('Network access for this voice provider has not been granted (open Settings → Voice)')
  }
}

async function fetchOk(url: string, init: RequestInit, label: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new CloudTtsError(`${label}: network error`)
  }
  if (res.status === 401 || res.status === 403) throw new CloudTtsError(`${label}: the API key was rejected`)
  if (res.status === 429) throw new CloudTtsError(`${label}: rate limit or quota reached`)
  if (!res.ok) throw new CloudTtsError(`${label}: request failed (${res.status})`)
  return res
}

// ------------------------------------------------------------------ Azure

const validRegion = (r: string) => /^[a-z0-9]+$/.test(r)
const VOICE_LIST_TTL = 7 * 24 * 3600 * 1000

interface AzureVoiceRaw {
  ShortName: string
  Locale: string
  LocalName: string
  DisplayName: string
  Gender: string
}

export async function listAzureVoices(region: string): Promise<CloudVoice[]> {
  if (!validRegion(region)) throw new CloudTtsError('Azure: invalid region')
  const cacheId = `azureVoices:${region}`
  const cached = (await chrome.storage.local.get(cacheId))[cacheId] as { at: number; voices: CloudVoice[] } | undefined
  if (cached && Date.now() - cached.at < VOICE_LIST_TTL) return cached.voices

  const { azureKey } = await loadSecrets()
  if (!azureKey) throw new CloudTtsError('Azure: no API key set')
  await ensurePermission(AZURE_ORIGIN(region))
  const res = await fetchOk(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': azureKey } }, 'Azure')
  const raw = (await res.json()) as AzureVoiceRaw[]
  const voices = raw.map((v) => ({ id: v.ShortName, name: `${v.LocalName || v.DisplayName} (${v.Gender}, ${v.Locale})`, lang: v.Locale }))
  await chrome.storage.local.set({ [cacheId]: { at: Date.now(), voices } })
  return voices
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
const percent = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

export async function synthesizeAzure(text: string, lang: string, settings: Settings): Promise<Audio> {
  const region = settings.azureRegion
  if (!validRegion(region)) throw new CloudTtsError('Azure: invalid region')
  const { azureKey } = await loadSecrets()
  if (!azureKey) throw new CloudTtsError('Azure: no API key set')

  const voices = await listAzureVoices(region)
  const picked = pickVoice(
    voices.map((v) => ({ ...v, name: v.id })),
    lang,
    settings.azureVoicePrefs[lang],
    navigator.languages
  )
  // A same-language voice from another region is fine; only a total miss is an error.
  if (!picked) throw new CloudTtsError(`Azure: no voice for ${lang}`)
  const voice = picked.voice.id
  const locale = picked.voice.lang || localesFor(lang)[0]

  const key = await cacheKey(['azure', voice, settings.rate, settings.pitch, text])
  const hit = await getCachedAudio(key)
  if (hit) return hit

  await ensurePermission(AZURE_ORIGIN(region))
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody rate="${percent(settings.rate)}" pitch="${percent(settings.pitch)}">${xmlEscape(text)}</prosody></voice></speak>`
  const res = await fetchOk(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azureKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    },
    'Azure'
  )
  const audio = { mime: 'audio/mpeg', data: await res.arrayBuffer() }
  await putCachedAudio(key, audio.mime, audio.data)
  return audio
}

// ------------------------------------------------------------------ ElevenLabs

interface ElevenUsage {
  month: string
  chars: number
}

const thisMonth = () => new Date().toISOString().slice(0, 7)

export async function getElevenUsage(): Promise<ElevenUsage> {
  const { elevenUsage } = (await chrome.storage.local.get({ elevenUsage: { month: thisMonth(), chars: 0 } })) as { elevenUsage: ElevenUsage }
  return elevenUsage.month === thisMonth() ? elevenUsage : { month: thisMonth(), chars: 0 }
}

async function addElevenUsage(chars: number) {
  const usage = await getElevenUsage()
  await chrome.storage.local.set({ elevenUsage: { month: usage.month, chars: usage.chars + chars } })
}

interface ElevenVoiceRaw {
  voice_id: string
  name: string
  labels?: Record<string, string>
}

export async function listElevenVoices(): Promise<CloudVoice[]> {
  const { elevenKey } = await loadSecrets()
  if (!elevenKey) throw new CloudTtsError('ElevenLabs: no API key set')
  await ensurePermission(ELEVEN_ORIGIN)
  const res = await fetchOk('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elevenKey } }, 'ElevenLabs')
  const { voices } = (await res.json()) as { voices: ElevenVoiceRaw[] }
  return voices.map((v) => {
    const accent = v.labels?.accent ? ` · ${v.labels.accent}` : ''
    return { id: v.voice_id, name: `${v.name}${accent}`, lang: v.labels?.language ?? '' }
  })
}

// Only these models accept `language_code` to force the spoken language.
const LANGUAGE_CODE_MODELS = new Set(['eleven_flash_v2_5', 'eleven_turbo_v2_5'])

/**
 * ElevenLabs with a user-supplied key, with guard rails so it can't quietly eat the
 * user's credits: per-request length cap, monthly character budget, and a local cache
 * so replays are free. Anything over a limit throws, and the caller falls back to the
 * browser voice.
 */
export async function synthesizeEleven(text: string, lang: string, settings: Settings): Promise<Audio> {
  const { elevenKey } = await loadSecrets()
  if (!elevenKey) throw new CloudTtsError('ElevenLabs: no API key set')
  if (text.length > settings.elevenMaxChars) throw new CloudTtsError(`ElevenLabs: text longer than ${settings.elevenMaxChars} characters`)

  let voiceId = settings.elevenVoiceId
  if (!voiceId) voiceId = (await listElevenVoices())[0]?.id ?? ''
  if (!voiceId) throw new CloudTtsError('ElevenLabs: no voice available on this account')

  const speed = Math.min(1.2, Math.max(0.7, settings.rate))
  const key = await cacheKey(['eleven', voiceId, settings.elevenModel, lang, speed, text])
  const hit = await getCachedAudio(key)
  if (hit) return hit

  const usage = await getElevenUsage()
  if (usage.chars + text.length > settings.elevenMonthlyBudget) {
    throw new CloudTtsError(`ElevenLabs: monthly budget of ${settings.elevenMonthlyBudget} characters reached`)
  }

  await ensurePermission(ELEVEN_ORIGIN)
  const body: Record<string, unknown> = { text, model_id: settings.elevenModel, voice_settings: { speed } }
  if (LANGUAGE_CODE_MODELS.has(settings.elevenModel)) body.language_code = lang.split('-')[0]
  const res = await fetchOk(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
    { method: 'POST', headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) },
    'ElevenLabs'
  )
  const audio = { mime: 'audio/mpeg', data: await res.arrayBuffer() }
  await addElevenUsage(text.length)
  await putCachedAudio(key, audio.mime, audio.data)
  return audio
}
