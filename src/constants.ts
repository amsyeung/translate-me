// Web Speech / chrome.tts parameter ranges
export const SPEECH_RATE_RANGE = { min: 0.5, max: 2 }
export const SPEECH_PITCH_RANGE = { min: 0.5, max: 2 }
export const SPEECH_VOLUME_RANGE = { min: 0, max: 1 }

export const DEBOUNCE_DEFAULT_WAIT = 300

// Translator API target language default, shared by the popup, options page,
// and background context-menu builder so first-run behavior is consistent.
export const DEFAULT_TARGET_LANG = 'en'

// Selections longer than this are truncated before translating in the popover.
export const MAX_SELECTION_CHARS = 3000

// Local translation history cap (chrome.storage.local).
export const MAX_HISTORY_ITEMS = 500
