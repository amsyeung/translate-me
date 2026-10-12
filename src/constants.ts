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

// Shared natural-voice server (server/tts-proxy). Called from the background with CORS,
// so the extension needs no host permission for it.
export const SHARED_TTS_URL = 'https://tts.aoricreative.com'
// The server's per-request limit is 300 characters; stay a little under it.
export const SHARED_TTS_CHUNK = 280
// Longer texts fall back to the browser voice rather than using up the shared quota.
export const SHARED_TTS_MAX_CHUNKS = 6

// Local translation history cap (chrome.storage.local).
export const MAX_HISTORY_ITEMS = 500
