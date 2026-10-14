import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { azureBase } from './config.mjs'

/**
 * Natural-sounding defaults for common locales, picked by ear; anything else gets the first
 * neural voice for its locale. A default may come from another region of the same language.
 */
const PREFERRED = {
  'en-US': 'en-CA-ClaraNeural',
  'en-CA': 'en-CA-ClaraNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'zh-HK': 'zh-HK-WanLungNeural',
  'zh-TW': 'zh-TW-YunJheNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'pt-BR': 'pt-BR-FranciscaNeural',
  'ru-RU': 'ru-RU-SvetlanaNeural',
  'vi-VN': 'vi-VN-HoaiMyNeural',
  'th-TH': 'th-TH-PremwadeeNeural',
}

const VOICE_LIST_TTL = 24 * 3600 * 1000

export class AzureClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config
    this.fetch = fetchImpl
    this.voices = null
    this.voicesAt = 0
    this.voicesFile = join(config.dataDir, 'voices.json')
  }

  /** [{ id, name, locale, gender }], cached in memory and on disk for a day. */
  async listVoices() {
    if (this.voices && Date.now() - this.voicesAt < VOICE_LIST_TTL) return this.voices
    if (!this.voices) {
      try {
        const saved = JSON.parse(await readFile(this.voicesFile, 'utf8'))
        if (Date.now() - saved.at < VOICE_LIST_TTL) {
          this.voices = saved.voices
          this.voicesAt = saved.at
          return this.voices
        }
      } catch {
        /* none saved yet */
      }
    }
    const res = await this.fetch(`${azureBase(this.config)}/cognitiveservices/voices/list`, {
      headers: { 'Ocp-Apim-Subscription-Key': this.config.azureKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new AzureError(res.status, 'voice list request failed')
    const raw = await res.json()
    this.voices = raw
      .filter((v) => !v.VoiceType || v.VoiceType === 'Neural')
      .map((v) => ({ id: v.ShortName, name: v.LocalName || v.DisplayName, locale: v.Locale, gender: v.Gender }))
    this.voicesAt = Date.now()
    writeFile(this.voicesFile, JSON.stringify({ at: this.voicesAt, voices: this.voices })).catch(() => {})
    return this.voices
  }

  /**
   * Choose a voice: the requested one if it speaks one of `locales`, else the preferred
   * voice of the first locale that has any voice, else that locale's first voice.
   */
  async pickVoice(locales, requested) {
    const voices = await this.listVoices()
    const wanted = locales.map((l) => l.toLowerCase())
    if (requested) {
      const v = voices.find((x) => x.id === requested)
      if (v && wanted.some((l) => v.locale.toLowerCase() === l || v.locale.toLowerCase().startsWith(l.split('-')[0] + '-'))) return v
    }
    for (const locale of wanted) {
      const forLocale = voices.filter((v) => v.locale.toLowerCase() === locale)
      if (!forLocale.length) continue
      const preferred = Object.entries(PREFERRED).find(([l]) => l.toLowerCase() === locale)?.[1]
      return voices.find((v) => v.id === preferred) ?? forLocale[0]
    }
    // No exact locale: any voice of the same language.
    const primary = new Set(wanted.map((l) => l.split('-')[0]))
    return voices.find((v) => primary.has(v.locale.toLowerCase().split('-')[0])) ?? null
  }

  async synthesize(text, voice, rate = 1, pitch = 1) {
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}">` +
      `<voice name="${voice.id}"><prosody rate="${percent(rate)}" pitch="${percent(pitch)}">${xmlEscape(text)}</prosody></voice></speak>`
    const res = await this.fetch(`${azureBase(this.config)}/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.azureKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'translate-me-tts-proxy',
      },
      body: ssml,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new AzureError(res.status, 'synthesis failed')
    return Buffer.from(await res.arrayBuffer())
  }
}

export class AzureError extends Error {
  constructor(status, message) {
    super(`Azure ${status}: ${message}`)
    this.status = status
  }
}

export const xmlEscape = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])
export const percent = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`
