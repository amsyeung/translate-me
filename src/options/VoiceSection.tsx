import { useCallback, useEffect, useState } from 'react'
import { SPEECH_PITCH_RANGE, SPEECH_RATE_RANGE } from '../constants'
import { cloudOrigin } from '../core/cloudOrigins'
import { SORTED_LANGUAGES, languageName, preferredLanguages } from '../core/languages'
import { requestSpeak, sendToBackground } from '../core/messages'
import { loadSecrets, saveSecrets, type Secrets, type Settings, type TtsProvider } from '../core/settings'
import { rankVoices } from '../core/voices'
import { LazyInput, Row, Section, Slider, buttonClass, inputClass } from './ui'

const SAMPLES: Record<string, string> = {
  en: 'Hello! This is how this voice sounds.',
  'zh-Hant': '你好！這就是這個聲音的效果。',
  zh: '你好！这就是这个声音的效果。',
  ja: 'こんにちは！これがこの声の聞こえ方です。',
  ko: '안녕하세요! 이 목소리는 이렇게 들립니다.',
  fr: 'Bonjour ! Voici comment sonne cette voix.',
  de: 'Hallo! So klingt diese Stimme.',
  es: '¡Hola! Así suena esta voz.',
  it: 'Ciao! Ecco come suona questa voce.',
  pt: 'Olá! É assim que esta voz soa.',
  ru: 'Привет! Вот как звучит этот голос.',
  vi: 'Xin chào! Đây là giọng nói này.',
  th: 'สวัสดี! นี่คือเสียงนี้',
}
const sampleFor = (lang: string) => SAMPLES[lang] ?? SAMPLES.en

interface CloudVoice {
  id: string
  name: string
  lang: string
}

const PROVIDERS: { id: TtsProvider; label: string; hint: string }[] = [
  { id: 'browser', label: 'Browser voices', hint: 'Free, offline. Quality depends on the voices installed on Windows / macOS.' },
  { id: 'azure', label: 'Azure Speech (your key)', hint: 'Natural neural voices incl. Cantonese. Free tier is ample for personal use.' },
  { id: 'elevenlabs', label: 'ElevenLabs (your key)', hint: 'Most natural, uses your credits — guarded by a monthly budget.' },
]

const ELEVEN_MODELS = [
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 — fastest, half the credits' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 — richer, full price' },
  { id: 'eleven_v3', label: 'v3 — most expressive, full price' },
]

function useBrowserVoices() {
  const [voices, setVoices] = useState<{ name: string; lang: string; remote?: boolean }[]>([])
  useEffect(() => {
    chrome.tts?.getVoices().then((list) => setVoices(list.filter((v) => v.voiceName && v.lang).map((v) => ({ name: v.voiceName!, lang: v.lang!, remote: v.remote }))))
  }, [])
  return voices
}

export default function VoiceSection({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const [lang, setLang] = useState(() => settings.tgtLang || preferredLanguages()[0] || 'en')
  const [secrets, setSecrets] = useState<Secrets>({ azureKey: '', elevenKey: '' })
  const [cloudVoices, setCloudVoices] = useState<CloudVoice[]>([])
  const [status, setStatus] = useState('')
  const [usage, setUsage] = useState(0)
  const browserVoices = useBrowserVoices()

  useEffect(() => {
    loadSecrets().then(setSecrets)
    chrome.storage.local.get('elevenUsage').then(({ elevenUsage }) => {
      const u = elevenUsage as { month: string; chars: number } | undefined
      setUsage(u && u.month === new Date().toISOString().slice(0, 7) ? u.chars : 0)
    })
  }, [])

  const provider = settings.ttsProvider
  const cloud = provider === 'browser' ? null : provider

  const loadCloudVoices = useCallback(async () => {
    if (!cloud) return
    setStatus('Loading voices…')
    const res = await sendToBackground<{ ok: boolean; voices?: CloudVoice[]; error?: string }>({ type: 'list-cloud-voices', provider: cloud })
    if (res.ok && res.voices) {
      setCloudVoices(res.voices)
      setStatus(`${res.voices.length} voices available.`)
    } else {
      setCloudVoices([])
      setStatus(res.error ?? 'Could not load voices.')
    }
  }, [cloud])

  // Requesting a host permission needs a user gesture, so it's tied to this button.
  const connect = async () => {
    if (!cloud) return
    const granted = await chrome.permissions.request({ origins: [cloudOrigin(cloud, settings)] })
    if (!granted) {
      setStatus('Permission was not granted, so the extension cannot reach this provider.')
      return
    }
    await loadCloudVoices()
  }

  useEffect(() => {
    if (!cloud) return
    chrome.permissions.contains({ origins: [cloudOrigin(cloud, { azureRegion: settings.azureRegion })] }).then((ok) => {
      if (ok) loadCloudVoices()
    })
  }, [cloud, settings.azureRegion, loadCloudVoices])

  const saveSecret = (patch: Partial<Secrets>) => {
    setSecrets((s) => ({ ...s, ...patch }))
    saveSecrets(patch)
  }

  const test = async () => {
    setStatus('Speaking…')
    const res = await requestSpeak(sampleFor(lang), lang)
    if (!res.ok) setStatus(`Failed: ${res.error}`)
    else if (res.fallbackReason) setStatus(`Used the browser voice instead — ${res.fallbackReason}`)
    else setStatus(`Played with ${res.provider === 'browser' ? 'browser voice' : res.provider}.`)
  }

  const ranked = rankVoices(browserVoices, lang, navigator.languages)
  const azureRanked = provider === 'azure' ? rankVoices(cloudVoices.map((v) => ({ ...v, name: v.id })), lang, navigator.languages) : []

  return (
    <Section title="Voice" description="Used by every speaker button: the popup, the highlight popover and the side panel.">
      <Row label="Voice provider">
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <label key={p.id} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="tts" className="mt-1" checked={provider === p.id} onChange={() => update({ ttsProvider: p.id })} />
              <span>
                {p.label}
                <span className="block text-xs text-zinc-400">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Row>

      {provider === 'azure' && (
        <>
          <Row label="Azure key" hint="Stored only on this device.">
            <LazyInput type="password" value={secrets.azureKey} onCommit={(v) => saveSecret({ azureKey: v })} placeholder="Speech resource key" className="w-80" />
          </Row>
          <Row label="Azure region" hint="e.g. eastasia, southeastasia, eastus">
            <LazyInput value={settings.azureRegion} onCommit={(v) => update({ azureRegion: v.toLowerCase() })} className="w-40" />
            <button type="button" className={buttonClass} onClick={connect} disabled={!secrets.azureKey}>
              Connect &amp; load voices
            </button>
          </Row>
        </>
      )}

      {provider === 'elevenlabs' && (
        <>
          <Row label="ElevenLabs key" hint="Stored only on this device.">
            <LazyInput type="password" value={secrets.elevenKey} onCommit={(v) => saveSecret({ elevenKey: v })} placeholder="xi-api-key" className="w-80" />
            <button type="button" className={buttonClass} onClick={connect} disabled={!secrets.elevenKey}>
              Connect &amp; load voices
            </button>
          </Row>
          <Row label="Voice">
            <select className={inputClass} value={settings.elevenVoiceId} onChange={(e) => update({ elevenVoiceId: e.target.value })}>
              <option value="">{cloudVoices.length ? 'First voice on my account' : 'Connect to load voices'}</option>
              {cloudVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Model">
            <select className={inputClass} value={settings.elevenModel} onChange={(e) => update({ elevenModel: e.target.value })}>
              {ELEVEN_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Monthly budget" hint={`Used this month: ${usage.toLocaleString()} characters`}>
            <input
              type="number"
              min={0}
              step={1000}
              className={`${inputClass} w-28`}
              value={settings.elevenMonthlyBudget}
              onChange={(e) => update({ elevenMonthlyBudget: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="text-zinc-500">characters — beyond this, the browser voice is used</span>
          </Row>
          <Row label="Longest text" hint="Longer selections use the browser voice">
            <input
              type="number"
              min={20}
              step={50}
              className={`${inputClass} w-28`}
              value={settings.elevenMaxChars}
              onChange={(e) => update({ elevenMaxChars: Math.max(20, Number(e.target.value) || 20) })}
            />
            <span className="text-zinc-500">characters per request</span>
          </Row>
        </>
      )}

      <Row label="Voice for" hint="Pick a language to choose its voice and test it.">
        <select className={inputClass} value={lang} onChange={(e) => setLang(e.target.value)}>
          {SORTED_LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.lang}
            </option>
          ))}
        </select>

        {provider === 'browser' && (
          <select
            className={inputClass}
            value={settings.voicePrefs[lang] ?? ''}
            onChange={(e) => update({ voicePrefs: { ...settings.voicePrefs, [lang]: e.target.value } })}
          >
            <option value="">Automatic{ranked[0] ? ` (${ranked[0].voice.name})` : ' (none installed)'}</option>
            {ranked.map(({ voice }) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} — {voice.lang}
              </option>
            ))}
          </select>
        )}
        {provider === 'azure' && (
          <select
            className={inputClass}
            value={settings.azureVoicePrefs[lang] ?? ''}
            onChange={(e) => update({ azureVoicePrefs: { ...settings.azureVoicePrefs, [lang]: e.target.value } })}
          >
            <option value="">{azureRanked[0] ? `Automatic (${azureRanked[0].voice.name})` : 'Automatic'}</option>
            {azureRanked.map(({ voice }) => (
              <option key={voice.id} value={voice.id}>
                {cloudVoices.find((v) => v.id === voice.id)?.name ?? voice.id}
              </option>
            ))}
          </select>
        )}

        <button type="button" className={buttonClass} onClick={test}>
          ▶ Test
        </button>
      </Row>
      {provider === 'browser' && ranked.length === 0 && (
        <p className="text-xs text-amber-700">
          No {languageName(lang)} voice is installed. Add one in Windows Settings → Time &amp; language → Speech, or macOS System Settings → Accessibility → Spoken
          Content.
        </p>
      )}
      {status && <p className="text-xs text-zinc-500">{status}</p>}

      <Row label="Speed" htmlFor="rate">
        <Slider id="rate" value={settings.rate} min={SPEECH_RATE_RANGE.min} max={SPEECH_RATE_RANGE.max} step={0.05} onCommit={(rate) => update({ rate })} />
      </Row>
      <Row label="Pitch" htmlFor="pitch" hint="Browser and Azure voices">
        <Slider id="pitch" value={settings.pitch} min={SPEECH_PITCH_RANGE.min} max={SPEECH_PITCH_RANGE.max} step={0.05} onCommit={(pitch) => update({ pitch })} />
      </Row>
      <Row label="Volume" htmlFor="volume">
        <Slider id="volume" value={settings.volume} min={0} max={1} step={0.05} onCommit={(volume) => update({ volume })} />
      </Row>
    </Section>
  )
}
