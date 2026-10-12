import { SHARED_TTS_CHUNK, SHARED_TTS_MAX_CHUNKS, SHARED_TTS_URL } from '../../constants'
import type { Settings } from '../../core/settings'
import { chunkForSpeech, localesFor } from '../../core/voices'
import { cacheKey, getCachedAudio, putCachedAudio } from './audioCache'
import { CloudTtsError, type Audio, type CloudVoice } from './cloud'

/**
 * The shared natural-voice server (server/tts-proxy): Microsoft neural voices through
 * one Azure free-tier key kept on the server. No key or permission needed here; the
 * server only answers this extension's origin and enforces shared limits.
 */

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) return body.message
  } catch {
    /* not JSON */
  }
  return `request failed (${res.status})`
}

async function fetchChunk(text: string, locales: string[], voice: string | undefined, settings: Settings): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(`${SHARED_TTS_URL}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locales, voice, rate: settings.rate, pitch: settings.pitch }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new CloudTtsError('Shared voices: server unreachable')
  }
  if (!res.ok) throw new CloudTtsError(`Shared voices: ${await errorMessage(res)}`)
  return res.arrayBuffer()
}

function concat(parts: ArrayBuffer[]): ArrayBuffer {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let offset = 0
  for (const p of parts) {
    out.set(new Uint8Array(p), offset)
    offset += p.byteLength
  }
  return out.buffer
}

export async function synthesizeShared(text: string, lang: string, settings: Settings): Promise<Audio> {
  const locales = localesFor(lang, navigator.languages)
  const voice = settings.sharedVoicePrefs[lang] || undefined
  const chunks = chunkForSpeech(text, SHARED_TTS_CHUNK, locales[0])
  if (chunks.length > SHARED_TTS_MAX_CHUNKS) throw new CloudTtsError('Shared voices: text too long, using the browser voice')

  // MP3 is a stream of independent frames, so same-format segments can be joined and played as one file.
  const parts: ArrayBuffer[] = []
  for (const chunk of chunks) {
    const key = await cacheKey(['shared', voice ?? '', locales.join(','), settings.rate, settings.pitch, chunk])
    const hit = await getCachedAudio(key)
    if (hit) {
      parts.push(hit.data)
      continue
    }
    const data = await fetchChunk(chunk, locales, voice, settings)
    await putCachedAudio(key, 'audio/mpeg', data)
    parts.push(data)
  }
  return { mime: 'audio/mpeg', data: concat(parts) }
}

export async function listSharedVoices(lang: string): Promise<CloudVoice[]> {
  const locales = localesFor(lang, navigator.languages)
  let res: Response
  try {
    res = await fetch(`${SHARED_TTS_URL}/v1/voices?locales=${encodeURIComponent(locales.join(','))}`, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new CloudTtsError('Shared voices: server unreachable')
  }
  if (!res.ok) throw new CloudTtsError(`Shared voices: ${await errorMessage(res)}`)
  const { voices } = (await res.json()) as { voices: { id: string; name: string; locale: string; gender?: string }[] }
  return voices.map((v) => ({ id: v.id, name: `${v.name}${v.gender ? ` (${v.gender}, ${v.locale})` : ` (${v.locale})`}`, lang: v.locale }))
}
