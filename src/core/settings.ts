import { DEFAULT_TARGET_LANG } from '../constants'

export type TriggerMode = 'auto' | 'icon' | 'modifier'
export type TtsProvider = 'browser' | 'shared' | 'azure' | 'elevenlabs'

/** User preferences, kept in chrome.storage.sync so they follow the user across devices. */
export interface Settings {
  /** Default source language; '' means auto-detect. */
  srcLang: string
  /** Target language for the popup, highlight popover and page translation. */
  tgtLang: string
  /**
   * Bilingual pair: when the selected text is already in `tgtLang`, translate it into
   * this language instead (e.g. tgt=zh-Hant, pair=en). '' disables it.
   */
  pairLang: string
  /** Most recently chosen target languages, newest first. */
  recentLangs: string[]

  /** Master switch for highlight-to-translate. */
  highlightEnabled: boolean
  /** auto: popover on every selection · icon: show a button first · modifier: only while Alt/Option is held. */
  triggerMode: TriggerMode
  /** Seconds before an un-hovered popover hides itself; 0 = stay until dismissed. */
  autoHideSeconds: number
  /** Don't react to selections inside inputs, textareas and rich-text editors. */
  skipEditable: boolean
  /** Hostnames where highlight-to-translate is turned off. */
  disabledSites: string[]
  /** Keep a local list of popover translations (for review / export). */
  saveHistory: boolean

  pitch: number
  rate: number
  volume: number
  ttsProvider: TtsProvider
  /** Language tag → preferred browser voice name. */
  voicePrefs: Record<string, string>
  azureRegion: string
  /** Language tag → preferred Azure voice short name. */
  azureVoicePrefs: Record<string, string>
  /** Language tag → preferred voice on the shared translate me voice server. */
  sharedVoicePrefs: Record<string, string>
  elevenVoiceId: string
  elevenModel: string
  /** Hard cap on ElevenLabs characters per calendar month (protects the user's credits). */
  elevenMonthlyBudget: number
  /** Longer texts fall back to the browser voice instead of spending credits. */
  elevenMaxChars: number
}

export const DEFAULT_SETTINGS: Settings = {
  srcLang: '',
  tgtLang: DEFAULT_TARGET_LANG,
  pairLang: '',
  recentLangs: [],

  highlightEnabled: true,
  triggerMode: 'auto',
  autoHideSeconds: 0,
  skipEditable: true,
  disabledSites: [],
  saveHistory: true,

  pitch: 1,
  rate: 1,
  volume: 1,
  ttsProvider: 'browser',
  voicePrefs: {},
  azureRegion: 'eastasia',
  azureVoicePrefs: {},
  sharedVoicePrefs: {},
  elevenVoiceId: '',
  elevenModel: 'eleven_flash_v2_5',
  elevenMonthlyBudget: 10000,
  elevenMaxChars: 300,
}

/** Secrets live in storage.local: never synced to Google, never leave this device except to their own API. */
export interface Secrets {
  azureKey: string
  elevenKey: string
}

export const DEFAULT_SECRETS: Secrets = { azureKey: '', elevenKey: '' }

const hasStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync)

export async function loadSettings(): Promise<Settings> {
  if (!hasStorage()) return { ...DEFAULT_SETTINGS }
  return (await chrome.storage.sync.get(DEFAULT_SETTINGS)) as Settings
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (!hasStorage()) return
  await chrome.storage.sync.set(patch)
}

export async function loadSecrets(): Promise<Secrets> {
  if (!hasStorage()) return { ...DEFAULT_SECRETS }
  return (await chrome.storage.local.get(DEFAULT_SECRETS)) as Secrets
}

export async function saveSecrets(patch: Partial<Secrets>): Promise<void> {
  if (!hasStorage()) return
  await chrome.storage.local.set(patch)
}

/** Subscribe to settings changes made from any extension context. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (patch: Partial<Settings>) => void): () => void {
  if (!hasStorage()) return () => {}
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync') return
    const patch: Partial<Settings> = {}
    for (const key of Object.keys(changes) as (keyof Settings)[]) {
      if (key in DEFAULT_SETTINGS) {
        // A removed key falls back to its default rather than becoming undefined.
        ;(patch as Record<string, unknown>)[key] = changes[key].newValue ?? DEFAULT_SETTINGS[key]
      }
    }
    if (Object.keys(patch).length) cb(patch)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

const MAX_RECENT = 5

export function withRecent(recent: string[], lang: string): string[] {
  return [lang, ...recent.filter((l) => l !== lang)].slice(0, MAX_RECENT)
}

/** Change the target language everywhere, remembering it in the recent list. */
export async function setTargetLanguage(lang: string): Promise<void> {
  const { recentLangs } = await loadSettings()
  await saveSettings({ tgtLang: lang, recentLangs: withRecent(recentLangs, lang) })
}

export function isSiteDisabled(settings: Pick<Settings, 'disabledSites'>, hostname: string): boolean {
  return Boolean(hostname) && settings.disabledSites.includes(hostname)
}

/** Labels for the trigger modes, shared by the popup and the options page. */
export const TRIGGER_MODES: { id: TriggerMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'As soon as I select text', hint: 'The translation appears right after you select text.' },
  { id: 'icon', label: 'After I click a translate button', hint: 'A small button appears next to the selection; click it to translate. Least intrusive.' },
  { id: 'modifier', label: 'Only when I hold Alt (⌥) while selecting', hint: 'Hold Alt (Option on Mac) while you select. Selecting normally does nothing.' },
]
