import type { HistoryItem } from './history'

/** Runtime messages exchanged between the popup, content script, background and offscreen document. */

/** Any context → background. */
export type BackgroundRequest =
  | { type: 'speak'; text: string; lang: string }
  | { type: 'stop-speaking' }
  | { type: 'list-cloud-voices'; provider: 'azure' | 'elevenlabs' | 'shared'; lang?: string }
  | { type: 'open-options' }
  | { type: 'add-history'; item: HistoryItem }

export type SpeakResponse =
  | { ok: true; provider: string; fallbackReason?: string }
  | { ok: false; error: string }

/** Background → content script. */
export type ContentRequest =
  | { type: 'translate-selection'; tgtLang?: string; focusedOnly?: boolean }
  | { type: 'translate-page'; tgtLang?: string }
  | { type: 'writing-tools'; focusedOnly?: boolean }
  | { type: 'ping' }

/** Background → offscreen document. */
export type OffscreenRequest =
  | { target: 'offscreen'; type: 'play'; audio: string; mime: string; volume: number }
  | { target: 'offscreen'; type: 'stop' }

export function sendToBackground<T = unknown>(msg: BackgroundRequest): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>
}

/** Ask the background to read `text` aloud in `lang` with the user's chosen voice provider. */
export async function requestSpeak(text: string, lang: string): Promise<SpeakResponse> {
  if (!text.trim()) return { ok: true, provider: 'none' }
  try {
    return await sendToBackground<SpeakResponse>({ type: 'speak', text, lang })
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) }
  }
}
