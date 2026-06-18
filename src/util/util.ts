import bcp47 from './bcp47.json'
import type { Bcp47Item, VoiceSettings } from '../types/speech'
import {
  DEBOUNCE_DEFAULT_WAIT,
  FALLBACK_VOICE_NAME,
  GOOGLE_VOICE_KEYWORD,
  SPEECH_PITCH_RANGE,
  SPEECH_RATE_RANGE,
  SPEECH_VOLUME_RANGE,
  DEFAULT_FALLBACK_LANG
} from '../constants'

/**
 * Copy plain text to system clipboard
 * Includes fallback solution for Chrome content script permission limitations
 * @param text Target text to copy
 * @returns True if copy succeeded, false on all failure paths
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  // Skip empty input directly
  if (!text) return false

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (clipErr) {
    // Fallback: hidden textarea copy for restricted environments
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return true
    } catch (fallbackErr) {
      console.error('Clipboard copy all failed:', clipErr, fallbackErr)
      return false
    }
  }
}

/**
 * Clamp numeric speech parameters to Web Speech API valid range
 * @param value Raw input number from user settings
 * @param min Minimum allowed value
 * @param max Maximum allowed value
 * @returns Sanitized value within legal bounds
 */
const clampSpeechParam = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

/**
 * Get all available speech synthesis voices asynchronously
 * Fixes the common bug where getVoices() returns empty array on initial page load
 * @returns Promise resolving to full list of SpeechSynthesisVoice
 */
const getAvailableVoices = async (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) return resolve(voices)

    // Wait for voice list load event if empty initially
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

/**
 * Read text aloud using browser Web Speech API
 * Stops existing ongoing speech before starting new playback
 * Matches Google voices first, then system fallback voice
 * Sanitizes pitch/rate/volume to valid ranges automatically
 * @param text Text content to speak
 * @param bcp47Lang BCP-47 language tag (e.g. en-US, zh-TW)
 * @param settings User audio playback configuration
 * @throws Error if no usable voices can be found
 */
export const speak = async (
  text: string,
  bcp47Lang: string,
  settings: VoiceSettings
): Promise<void> => {
  // Ignore blank text input
  if (!text.trim()) return

  const voices = await getAvailableVoices()
  if (voices.length === 0) throw new Error('No speech synthesis voices available')

  // Filter & sort matching Google voices for target language
  const googleVoices = voices
    .filter(voice =>
      voice.lang.toLowerCase().includes(bcp47Lang.toLowerCase()) &&
      voice.name.toLowerCase().includes(GOOGLE_VOICE_KEYWORD)
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  let targetVoice: SpeechSynthesisVoice | undefined
  // Prioritize Google voice; use preset fallback voice or first available voice
  if (googleVoices.length > 0) {
    targetVoice = googleVoices[0]
  } else {
    targetVoice = voices.find(v => v.name === FALLBACK_VOICE_NAME) ?? voices[0]
  }

  if (!targetVoice) throw new Error('Cannot find any available voice')

  // Restrict parameters to API legal ranges
  const safePitch = clampSpeechParam(settings.pitch, SPEECH_PITCH_RANGE.min, SPEECH_PITCH_RANGE.max)
  const safeRate = clampSpeechParam(settings.rate, SPEECH_RATE_RANGE.min, SPEECH_RATE_RANGE.max)
  const safeVolume = clampSpeechParam(settings.volume, SPEECH_VOLUME_RANGE.min, SPEECH_VOLUME_RANGE.max)

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = bcp47Lang
  utterance.voice = targetVoice
  utterance.pitch = safePitch
  utterance.rate = safeRate
  utterance.volume = safeVolume

  // Terminate previous speech to avoid overlapping audio
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

/**
 * Map detected raw language code to human-readable language name from BCP47 dataset
 * Extracts primary language prefix before hyphen and performs case-insensitive matching
 * @param detectedLanguage Raw detected language string (e.g. zh-TW, en-GB)
 * @returns Formatted display string with detected label suffix
 */
export const lookUpLang = (detectedLanguage: string): string => {
  if (!detectedLanguage) return `${DEFAULT_FALLBACK_LANG} - Detected`

  const primaryLangCode = detectedLanguage.split('-')[0].toLowerCase()
  const bcpList = bcp47 as Bcp47Item[]

  const matchedItems = bcpList.filter(item => item.tag.toLowerCase() === primaryLangCode)
  const langNames = matchedItems.map(item => item.lang)

  return langNames.length > 0
    ? `${langNames.join(', ')} - Detected`
    : `${DEFAULT_FALLBACK_LANG} - Detected`
}

/**
 * Generic debounce utility to throttle frequent function calls
 * Delays execution until after specified quiet period has passed
 * @param fn Original callback function to wrap
 * @param wait Millisecond delay threshold before execution
 * @returns Wrapped debounced function with identical argument types
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait = DEBOUNCE_DEFAULT_WAIT
): (...args: Parameters<T>) => void {
  let timerId: number | null = null

  return (...args: Parameters<T>) => {
    // Clear pending timeout on each new trigger
    if (timerId !== null) clearTimeout(timerId)
    timerId = window.setTimeout(() => fn(...args), wait)
  }
}