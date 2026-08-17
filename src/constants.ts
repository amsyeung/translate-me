// Web Speech API
export const SPEECH_RATE_RANGE = { min: 0.1, max: 10 }
export const SPEECH_PITCH_RANGE = { min: 0, max: 2 }
export const SPEECH_VOLUME_RANGE = { min: 0, max: 1 }

export const DEBOUNCE_DEFAULT_WAIT = 300
export const GOOGLE_VOICE_KEYWORD = 'google'
export const DEFAULT_FALLBACK_LANG = 'English'

// Translator API target language default, shared by the popup, options page,
// and background context-menu builder so first-run behavior is consistent.
export const DEFAULT_TARGET_LANG = 'en'