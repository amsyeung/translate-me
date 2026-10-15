import { findLanguage } from './languages'

/** The subset of chrome.tts.TtsVoice / SpeechSynthesisVoice / cloud voice info we rank on. */
export interface VoiceInfo {
  name: string
  lang: string
  remote?: boolean
}

const QUALITY_HINTS = /natural|neural|online|premium|enhanced|wavenet|studio/i

const normLocale = (l: string) => l.replace(/_/g, '-').toLowerCase()

/**
 * Regions the clock can vouch for. Chrome's "Chinese (Traditional)" language is zh-TW, so
 * many Hong Kong users never list zh-HK; their time zone still says where they are.
 */
const TIME_ZONE_LOCALES: Record<string, string> = {
  'Asia/Hong_Kong': 'zh-HK',
  'Asia/Macau': 'zh-HK',
}

function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/**
 * Locales to look for, for a Translator-API language tag, most preferred first.
 * Locales the user actually has in their browser languages float to the front, so a
 * Hong Kong user gets a Cantonese (zh-HK) voice for Traditional Chinese while a
 * Taiwan user gets Mandarin (zh-TW), and en-GB users get a British voice. When the
 * browser languages don't name the region, a Hong Kong or Macau time zone does.
 * Read on this device only; nothing is sent anywhere.
 */
export function localesFor(langTag: string, userLocales: readonly string[] = [], timeZone = currentTimeZone()): string[] {
  const regions = findLanguage(langTag)?.regions ?? [langTag]
  const user = userLocales.map(normLocale)
  const hinted = TIME_ZONE_LOCALES[timeZone]
  if (hinted && !user.includes(normLocale(hinted))) user.unshift(normLocale(hinted))
  const rank = (r: string) => {
    const i = user.indexOf(normLocale(r))
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return regions
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r)
}

export interface RankedVoice<V extends VoiceInfo> {
  voice: V
  /** region: exact locale match · family: same language, other region */
  quality: 'region' | 'family'
}

/**
 * Order the installed voices that can speak `langTag`, best first.
 * Region preference dominates (accent matters more than polish), then voices that
 * advertise neural/natural quality, then Google's network voices over basic local ones.
 */
export function rankVoices<V extends VoiceInfo>(voices: readonly V[], langTag: string, userLocales: readonly string[] = []): RankedVoice<V>[] {
  const locales = localesFor(langTag, userLocales).map(normLocale)
  const primaries = new Set(locales.map((l) => l.split('-')[0]))
  primaries.add(langTag.split('-')[0].toLowerCase())

  const scored: { voice: V; score: number; quality: 'region' | 'family' }[] = []
  for (const voice of voices) {
    const vl = normLocale(voice.lang ?? '')
    const regionIdx = locales.indexOf(vl)
    const family = primaries.has(vl.split('-')[0])
    if (regionIdx === -1 && !family) continue

    let score = regionIdx !== -1 ? 1000 - regionIdx * 100 : 0
    if (QUALITY_HINTS.test(voice.name)) score += 20
    if (/google/i.test(voice.name)) score += 10
    else if (voice.remote) score += 5
    scored.push({ voice, score, quality: regionIdx !== -1 ? 'region' : 'family' })
  }
  return scored.sort((a, b) => b.score - a.score).map(({ voice, quality }) => ({ voice, quality }))
}

/** Pick the voice to use: the user's saved choice if it's still installed, else the best ranked. */
export function pickVoice<V extends VoiceInfo>(
  voices: readonly V[],
  langTag: string,
  preferredName: string | undefined,
  userLocales: readonly string[] = []
): RankedVoice<V> | null {
  if (preferredName) {
    const saved = voices.find((v) => v.name === preferredName)
    if (saved) return { voice: saved, quality: 'region' }
  }
  return rankVoices(voices, langTag, userLocales)[0] ?? null
}

/**
 * Split text into speakable chunks of at most `max` characters on sentence boundaries.
 * Chrome's Google network voices silently stop after ~15 seconds of audio, so long text
 * must be queued as several utterances.
 */
export function chunkForSpeech(text: string, max = 180, locale?: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]

  const sentences: string[] = []
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Segmenter) {
    for (const s of new Segmenter(locale, { granularity: 'sentence' }).segment(clean)) sentences.push(s.segment)
  } else {
    sentences.push(...(clean.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [clean]))
  }

  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence
      continue
    }
    flush()
    if (sentence.length <= max) {
      current = sentence
      continue
    }
    // A single overlong sentence: break on commas / spaces, then hard-cut as a last resort.
    let rest = sentence
    while (rest.length > max) {
      const window = rest.slice(0, max)
      const cut = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf('、'), window.lastIndexOf(' '))
      const at = cut > max / 3 ? cut + 1 : max
      chunks.push(rest.slice(0, at).trim())
      rest = rest.slice(at)
    }
    current = rest
  }
  flush()
  return chunks.filter(Boolean)
}
