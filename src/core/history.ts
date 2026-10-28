import { MAX_HISTORY_ITEMS } from '../constants'

export interface HistoryItem {
  text: string
  translated: string
  src: string
  tgt: string
  /** Hostname the text was selected on. */
  site: string
  at: number
  /** Word meaning (single words only, when the on-device model is available). */
  partOfSpeech?: string
  definition?: string
  example?: string
}

const KEY = 'history'

export async function loadHistory(): Promise<HistoryItem[]> {
  const { history } = (await chrome.storage.local.get({ [KEY]: [] })) as { history: HistoryItem[] }
  return history
}

const MAX_TEXT = 1000

/** Add an entry (newest first). Re-translating the same text moves it to the top instead of duplicating it. */
export async function addHistory(entry: HistoryItem): Promise<void> {
  const item = { ...entry, text: entry.text.slice(0, MAX_TEXT), translated: entry.translated.slice(0, MAX_TEXT) }
  const history = await loadHistory()
  const next = [item, ...history.filter((h) => !(h.text === item.text && h.tgt === item.tgt))].slice(0, MAX_HISTORY_ITEMS)
  await chrome.storage.local.set({ [KEY]: next })
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(KEY)
}

/** CSV with a header row; the first two columns import straight into Anki as front/back, word meanings follow at the end. */
export function historyToCsv(items: HistoryItem[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = items.map((h) =>
    [h.text, h.translated, h.src, h.tgt, h.site, new Date(h.at).toISOString(), h.partOfSpeech ?? '', h.definition ?? '', h.example ?? ''].map(cell).join(',')
  )
  return ['text,translation,source_lang,target_lang,site,date,part_of_speech,definition,example', ...rows].join('\r\n')
}
