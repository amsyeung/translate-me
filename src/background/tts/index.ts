import type { SpeakResponse } from '../../core/messages'
import { loadSettings } from '../../core/settings'
import { speakWithBrowser, stopBrowserVoice } from './browserVoice'
import { CloudTtsError, synthesizeAzure, synthesizeEleven, type Audio } from './cloud'
import { playAudio, stopAudio } from './offscreen'

// Bumped by every speak/stop so a slow cloud request can't start playing after it was superseded.
let generation = 0

export async function stopSpeaking() {
  generation++
  stopBrowserVoice()
  await stopAudio()
}

/**
 * Speak `text` in `lang` with the user's chosen provider. Cloud providers fall back to
 * the browser voice on any problem (no key, over budget, offline), so the speaker
 * button always does something.
 */
export async function speak(text: string, lang: string): Promise<SpeakResponse> {
  // Claim a generation synchronously, before any await, so a concurrent call always wins.
  const gen = ++generation
  const stale = () => gen !== generation
  stopBrowserVoice()
  await stopAudio()
  const settings = await loadSettings()

  let fallbackReason: string | undefined
  if (settings.ttsProvider !== 'browser') {
    try {
      let audio: Audio
      if (settings.ttsProvider === 'azure') audio = await synthesizeAzure(text, lang, settings)
      else audio = await synthesizeEleven(text, lang, settings)
      if (stale()) return { ok: true, provider: settings.ttsProvider }
      await playAudio(audio, settings.volume)
      return { ok: true, provider: settings.ttsProvider }
    } catch (err) {
      fallbackReason = err instanceof CloudTtsError ? err.message : String((err as Error)?.message ?? err)
      console.warn(`[translate-me] ${settings.ttsProvider} TTS failed, using browser voice:`, fallbackReason)
    }
  }

  if (stale()) return { ok: true, provider: 'browser', fallbackReason }
  try {
    const warning = await speakWithBrowser(text, lang, settings)
    return { ok: true, provider: 'browser', fallbackReason: fallbackReason ?? warning }
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) }
  }
}
