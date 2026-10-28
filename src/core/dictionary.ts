import type { LanguageModelSession } from '../types/translator'
import { WRITING_LANGUAGES, writingAvailability } from './writer'

/**
 * Word meanings for a selected word or short phrase, from Chrome's on-device Gemini Nano:
 * part of speech, a short definition of the sense used in the surrounding sentence, and
 * an example. The definition is written in the word's own language; the caller translates it.
 */

export interface WordInfo {
  partOfSpeech: string
  /** The meaning in this sentence in a word or two ("riverbank"), so it can be translated precisely. */
  sense: string
  definition: string
  example: string
}

/** Languages Gemini Nano can explain words in (it writes the definition in the same language). */
export const DICTIONARY_LANGUAGES = WRITING_LANGUAGES

// Short English sentences look like phrases by length ("How are you", "I like it"): a question
// word or auxiliary up front, or a personal pronoun anywhere, marks them as sentences.
const EN_SENTENCE_START = /^(how|what|why|where|when|who|which|whose|is|are|am|was|were|do|does|did|can|could|will|would|shall|should|may|might|have|has|had)$/
const EN_PRONOUN = /^(i|you|he|she|we|they|it|me|him|her|us|them|i'm|you're|it's|that's|let's)$/

/** A single word or a short phrase ("run out of", "break the ice"), not a sentence. */
export function isWordLike(text: string, lang: string): boolean {
  const t = text.trim()
  if (!t || t.length > 40 || /[.!?。！？\n]/.test(t)) return false
  // Japanese has no spaces between words: judge by length instead.
  if (lang.startsWith('ja')) return t.length <= 12
  const words = t.split(/\s+/)
  if (words.length > 3 || !/\p{L}/u.test(t)) return false
  if (words.length > 1 && lang.startsWith('en')) {
    const lower = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))
    if (EN_SENTENCE_START.test(lower[0]) || lower.some((w) => EN_PRONOUN.test(w))) return false
  }
  return true
}

/**
 * The sentence around `word` in `text` (where the selection sits), so a word with several
 * meanings ("bank") gets the right one. Returns '' when there's nothing useful.
 */
export function sentenceAround(text: string, word: string, at = text.indexOf(word)): string {
  if (at < 0) return ''
  const ends = /[.!?。！？\n]/
  let start = at
  while (start > 0 && !ends.test(text[start - 1])) start--
  let end = at + word.length
  while (end < text.length && !ends.test(text[end])) end++
  const sentence = text.slice(start, Math.min(end + 1, text.length)).replace(/\s+/g, ' ').trim()
  // Only worth sending if it adds something beyond the word itself.
  return sentence.length > word.length + 3 ? sentence.slice(0, 300) : ''
}

const SYSTEM_PROMPT = [
  "You are a learner's dictionary.",
  'You get a word or short phrase and, when available, the sentence it was found in.',
  'Give its part of speech; its meaning in that sentence as one to three common words of the same part of speech, like a synonym a dictionary would list (for example "riverbank" for bank by a river, "penalty" for fine as money you must pay); a short plain definition (at most 15 words) of that meaning; and one short, natural example sentence that uses it.',
  'Write everything in the same language as the word. Do not translate, do not add notes.',
  'If the input is a name or not a real word, give your best short description.',
].join(' ')

export function buildLookupPrompt(word: string, context: string): string {
  return context ? `Word: ${word}\nSentence: ${context}` : `Word: ${word}`
}

const EXAMPLES: { word: string; context: string; info: WordInfo }[] = [
  {
    word: 'bank',
    context: 'We had a picnic on the bank of the river.',
    info: { partOfSpeech: 'noun', sense: 'riverbank', definition: 'the land along the side of a river', example: 'They sat on the river bank and watched the boats.' },
  },
  {
    word: 'fine',
    context: 'He had to pay a fine for parking there.',
    info: { partOfSpeech: 'noun', sense: 'penalty', definition: 'money you must pay for breaking a rule', example: 'The library charges a small fine for late books.' },
  },
  {
    word: 'universal',
    context: 'Music is a universal language.',
    info: { partOfSpeech: 'adjective', sense: 'worldwide', definition: 'shared by or true for everyone everywhere', example: 'Smiling is a universal sign of friendliness.' },
  },
  {
    word: 'serendipity',
    context: '',
    info: { partOfSpeech: 'noun', sense: 'lucky chance', definition: 'finding something good by chance', example: 'Meeting my best friend in that café was pure serendipity.' },
  },
  {
    word: 'ran out of',
    context: 'Sorry, we ran out of milk this morning.',
    info: { partOfSpeech: 'phrasal verb', sense: 'used up', definition: 'used all of something so that none is left', example: 'My phone ran out of battery on the way home.' },
  },
]

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { partOfSpeech: { type: 'string' }, sense: { type: 'string' }, definition: { type: 'string' }, example: { type: 'string' } },
  required: ['partOfSpeech', 'sense', 'definition', 'example'],
  additionalProperties: false,
}

const expectations = (lang: string) => ({
  expectedInputs: [{ type: 'text' as const, languages: [lang] }],
  expectedOutputs: [{ type: 'text' as const, languages: [lang] }],
})

const baseSessions = new Map<string, Promise<LanguageModelSession>>()

function baseSession(lang: string): Promise<LanguageModelSession> {
  let pending = baseSessions.get(lang)
  if (!pending) {
    const api = globalThis.LanguageModel
    if (!api) return Promise.reject(new Error('LanguageModel unavailable'))
    // The worked examples are English; they show the format, and the system prompt keeps
    // the answer in the word's own language for Japanese and Spanish.
    const turns = EXAMPLES.flatMap((e) => [
      { role: 'user' as const, content: buildLookupPrompt(e.word, e.context) },
      { role: 'assistant' as const, content: JSON.stringify(e.info) },
    ])
    pending = api.create({ ...expectations(lang), initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }, ...turns] })
    pending.catch(() => baseSessions.delete(lang))
    baseSessions.set(lang, pending)
  }
  return pending
}

export function parseWordInfo(reply: string): WordInfo | null {
  try {
    const v = JSON.parse(reply.trim()) as Partial<WordInfo>
    const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')
    const info = { partOfSpeech: clean(v.partOfSpeech).toLowerCase(), sense: clean(v.sense), definition: clean(v.definition), example: clean(v.example) }
    return info.definition ? info : null
  } catch {
    return null
  }
}

/** Can word meanings run here, for `lang`? Never starts a download. */
export async function dictionaryReady(lang: string): Promise<boolean> {
  const primary = lang.split('-')[0]
  return DICTIONARY_LANGUAGES.includes(primary) && (await writingAvailability(primary)) === 'available'
}

/** Look a word up; null when the model couldn't give a usable answer. */
export async function lookupWord(word: string, lang: string, options: { context?: string; signal?: AbortSignal } = {}): Promise<WordInfo | null> {
  const primary = lang.split('-')[0]
  if (!(await dictionaryReady(primary))) return null
  const session = await (await baseSession(primary)).clone({ signal: options.signal })
  try {
    const reply = await session.prompt(buildLookupPrompt(word.trim(), options.context ?? ''), { signal: options.signal, responseConstraint: RESPONSE_SCHEMA })
    return parseWordInfo(reply)
  } finally {
    session.destroy()
  }
}
