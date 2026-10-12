import { SPEECH_PITCH_RANGE, SPEECH_RATE_RANGE, SPEECH_VOLUME_RANGE } from '../../constants'
import type { Settings } from '../../core/settings'
import { chunkForSpeech, localesFor, pickVoice, type VoiceInfo } from '../../core/voices'

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v))

type TtsVoice = chrome.tts.TtsVoice & VoiceInfo

export async function getBrowserVoices(): Promise<TtsVoice[]> {
  const voices = await chrome.tts.getVoices()
  return voices.filter((v): v is TtsVoice => Boolean(v.voiceName && v.lang)).map((v) => ({ ...v, name: v.voiceName!, lang: v.lang! }))
}

/**
 * Speak with the OS / Chrome voices through chrome.tts. Runs in the service worker, so it
 * works identically from the popup, the options page and any web page (no page CSP or
 * autoplay policy involved), and on both Windows and macOS.
 */
export async function speakWithBrowser(text: string, lang: string, settings: Settings): Promise<string | undefined> {
  const voices = await getBrowserVoices()
  const match = pickVoice(voices, lang, settings.voicePrefs[lang], navigator.languages)
  let warning: string | undefined
  if (!match) warning = `No installed voice for ${lang}; install one in your OS speech settings.`

  const locale = match?.voice.lang ?? localesFor(lang, navigator.languages)[0] ?? lang
  const chunks = chunkForSpeech(text, 180, locale)

  chrome.tts.stop()
  chunks.forEach((chunk, i) => {
    chrome.tts.speak(chunk, {
      // Without a matching voice, still pass `lang` so Chrome can choose something sensible.
      voiceName: match?.voice.name,
      lang: locale,
      rate: clamp(settings.rate, SPEECH_RATE_RANGE),
      pitch: clamp(settings.pitch, SPEECH_PITCH_RANGE),
      volume: clamp(settings.volume, SPEECH_VOLUME_RANGE),
      enqueue: i > 0,
    })
  })
  return warning
}

export function stopBrowserVoice() {
  chrome.tts.stop()
}
