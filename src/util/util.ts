import bcp47 from './bcp47.json'
import type { Bcp47Item, VoiceSettings } from '../types/speech'
import {
  DEBOUNCE_DEFAULT_WAIT,
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

// Shared across calls so concurrent speak() calls don't clobber each other's
// onvoiceschanged handler while the OS is still lazily populating the voice list
// (common on cold start, especially with Windows SAPI voices).
let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null

/**
 * Get all available speech synthesis voices asynchronously
 * Fixes the common bug where getVoices() returns empty array on initial page load
 * @returns Promise resolving to full list of SpeechSynthesisVoice
 */
const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)

  if (!voicesReadyPromise) {
    voicesReadyPromise = new Promise((resolve) => {
      window.speechSynthesis.onvoiceschanged = () => {
        resolve(window.speechSynthesis.getVoices())
      }
    })
  }
  return voicesReadyPromise
}

type VoiceMatch = { voice: SpeechSynthesisVoice; quality: 'region' | 'family' }

/**
 * Pick the best installed voice for a Translator/LanguageDetector API language
 * tag (e.g. `zh`, `zh-Hant`, `en`). Those tags are script/language-based, while
 * `SpeechSynthesisVoice.lang` is always a full region-qualified locale (e.g.
 * `zh-CN`, `zh-TW`, `en-GB`) on both macOS and Windows — the two vocabularies
 * don't line up as substrings, so we go through `bcp47.json`'s `regions` list
 * to translate one into the other.
 * @returns The best match found, or null if no installed voice speaks this language at all
 */
const findVoiceForLang = (voices: SpeechSynthesisVoice[], langTag: string): VoiceMatch | null => {
  if (!langTag) return null

  const preferGoogle = (candidates: SpeechSynthesisVoice[]) =>
    candidates.find(v => v.name.toLowerCase().includes(GOOGLE_VOICE_KEYWORD)) ?? candidates[0]

  const entry = (bcp47 as Bcp47Item[]).find(item => item.tag.toLowerCase() === langTag.toLowerCase())
  const regionCandidates = entry?.regions?.length ? entry.regions : [langTag]

  // Tier 1: exact region match (e.g. "zh-Hant" -> a "zh-TW" or "zh-HK" voice).
  // This is what actually distinguishes Cantonese from Mandarin, or en-GB from en-US.
  for (const region of regionCandidates) {
    const matches = voices.filter(v => v.lang.toLowerCase() === region.toLowerCase())
    if (matches.length > 0) return { voice: preferGoogle(matches), quality: 'region' }
  }

  // Tier 2: same primary language family, any region (better than an unrelated language).
  const primary = langTag.split('-')[0].toLowerCase()
  const familyMatches = voices.filter(v => v.lang.toLowerCase().split('-')[0] === primary)
  if (familyMatches.length > 0) return { voice: preferGoogle(familyMatches), quality: 'family' }

  return null
}

/**
 * Read text aloud using browser Web Speech API
 * Stops existing ongoing speech before starting new playback
 * Sanitizes pitch/rate/volume to valid ranges automatically
 * @param text Text content to speak
 * @param langTag Translator/LanguageDetector API language tag (e.g. en, zh, zh-Hant)
 * @param settings User audio playback configuration
 * @throws Error if no usable voices can be found, or the language isn't known yet
 */
export const speak = async (
  text: string,
  langTag: string,
  settings: VoiceSettings
): Promise<void> => {
  // Ignore blank text input
  if (!text.trim()) return
  if (!langTag) throw new Error('Cannot speak: language is not known yet')

  const voices = await getAvailableVoices()
  if (voices.length === 0) throw new Error('No speech synthesis voices available')

  const match = findVoiceForLang(voices, langTag)
  const targetVoice = match?.voice ?? voices.find(v => v.default) ?? voices[0]

  if (!match) {
    console.warn(
      `[translate-me] No installed voice matches "${langTag}"; falling back to "${targetVoice.name}" (${targetVoice.lang}). Audio will likely be mispronounced.`
    )
  } else if (match.quality === 'family') {
    console.warn(
      `[translate-me] No exact regional voice for "${langTag}"; using "${targetVoice.name}" (${targetVoice.lang}) as a same-language fallback.`
    )
  }

  // Restrict parameters to API legal ranges
  const safePitch = clampSpeechParam(settings.pitch, SPEECH_PITCH_RANGE.min, SPEECH_PITCH_RANGE.max)
  const safeRate = clampSpeechParam(settings.rate, SPEECH_RATE_RANGE.min, SPEECH_RATE_RANGE.max)
  const safeVolume = clampSpeechParam(settings.volume, SPEECH_VOLUME_RANGE.min, SPEECH_VOLUME_RANGE.max)

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.voice = targetVoice
  // Keep utterance.lang in sync with the voice actually used, not the requested
  // tag — engines prioritize `voice`, so a mismatched `lang` is misleading.
  utterance.lang = targetVoice.lang
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
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait = DEBOUNCE_DEFAULT_WAIT
): (...args: Args) => void {
  let timerId: number | null = null

  return (...args: Args) => {
    // Clear pending timeout on each new trigger
    if (timerId !== null) clearTimeout(timerId)
    timerId = window.setTimeout(() => fn(...args), wait)
  }
}