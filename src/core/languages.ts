import bcp47 from '../util/bcp47.json'
import type { Bcp47Item } from '../types/speech'

/**
 * Every language the Chrome Translator API supports, keyed by the exact tag
 * the API expects (`zh`, `zh-Hant`, `he`, `no`, ...).
 */
export const LANGUAGES = bcp47 as Bcp47Item[]

/** Same list, sorted by display name, for <select> menus. Computed once. */
export const SORTED_LANGUAGES = LANGUAGES.slice().sort((a, b) => a.lang.localeCompare(b.lang))

const BY_TAG = new Map(LANGUAGES.map((l) => [l.tag.toLowerCase(), l]))

export function findLanguage(tag: string | null | undefined): Bcp47Item | undefined {
  return tag ? BY_TAG.get(tag.toLowerCase()) : undefined
}

export function languageName(tag: string | null | undefined): string {
  return findLanguage(tag)?.lang ?? (tag || 'Unknown')
}

export function isSupportedLanguage(tag: string | null | undefined): tag is string {
  return Boolean(findLanguage(tag))
}

// Chinese tags that mean "Traditional characters", whatever form they arrive in.
const TRADITIONAL_ZH = /^zh-(hant|tw|hk|mo)(\b|-)/i
// Legacy / alternate codes that the Translator API spells differently.
const ALIASES: Record<string, string> = { iw: 'he', nb: 'no', nn: 'no', in: 'id', yue: 'zh-Hant' }

/**
 * Map any BCP 47 tag (from LanguageDetector, `navigator.languages`,
 * `<html lang>`, a voice locale, ...) onto the Translator API's tag space.
 * Returns null when the language isn't one the Translator API can handle —
 * including romanised forms like `ja-Latn`, which are *not* Japanese script.
 */
export function normalizeLanguageTag(tag: string | null | undefined): string | null {
  if (!tag) return null
  const clean = tag.trim().replace(/_/g, '-')
  if (!clean || clean.toLowerCase() === 'und') return null

  const parts = clean.split('-')
  const primary = parts[0].toLowerCase()

  // A Latin-script transliteration (zh-Latn = pinyin, hi-Latn = Hinglish...) would
  // be mistranslated if fed to the model for the base language.
  if (parts.slice(1).some((p) => p.toLowerCase() === 'latn') && primary !== 'en') return null

  if (primary === 'zh') return TRADITIONAL_ZH.test(clean) ? 'zh-Hant' : 'zh'

  const aliased = ALIASES[primary] ?? primary
  return isSupportedLanguage(aliased) ? (findLanguage(aliased)?.tag ?? null) : null
}

/** The user's browser UI languages, normalized and de-duplicated, in preference order. */
export function preferredLanguages(): string[] {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  return [...new Set(langs.map(normalizeLanguageTag).filter((t): t is string => t !== null))]
}

/** True if the user's browser locale indicates Traditional Chinese (HK / TW / MO). */
export function prefersTraditionalChinese(): boolean {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const l of langs) {
    if (!/^zh/i.test(l)) continue
    return TRADITIONAL_ZH.test(l)
  }
  return false
}
