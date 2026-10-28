import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWordLike, parseWordInfo, sentenceAround } from '../src/core/dictionary'

describe('isWordLike', () => {
  it('accepts a word or a short phrase', () => {
    expect(isWordLike('serendipity', 'en')).toBe(true)
    expect(isWordLike('ran out of', 'en')).toBe(true)
    expect(isWordLike('  bank ', 'en')).toBe(true)
    expect(isWordLike('猫', 'ja')).toBe(true)
  })
  it('rejects sentences, long phrases and non-words', () => {
    expect(isWordLike('I went to the bank.', 'en')).toBe(false)
    expect(isWordLike('one two three four', 'en')).toBe(false)
    expect(isWordLike('2026', 'en')).toBe(false)
    expect(isWordLike('', 'en')).toBe(false)
    expect(isWordLike('今日はとても良い天気ですね', 'ja')).toBe(false)
  })
})

describe('sentenceAround', () => {
  const text = 'It rained all day. We had a picnic on the bank of the river anyway! Then we went home.'
  it('returns the sentence the word sits in', () => {
    expect(sentenceAround(text, 'bank')).toBe('We had a picnic on the bank of the river anyway!')
  })
  it('uses the selection position when the word appears more than once', () => {
    const repeated = 'The bank was closed. I sat on the river bank.'
    expect(sentenceAround(repeated, 'bank', repeated.lastIndexOf('bank'))).toBe('I sat on the river bank.')
  })
  it('gives nothing when the "sentence" is just the word', () => {
    expect(sentenceAround('bank', 'bank')).toBe('')
    expect(sentenceAround('no match here', 'bank')).toBe('')
  })
})

describe('parseWordInfo', () => {
  it('cleans the model reply', () => {
    expect(parseWordInfo('{"partOfSpeech":" Noun ","sense":"riverbank","definition":"the land  along a river","example":"We sat on the bank."}')).toEqual({
      partOfSpeech: 'noun',
      sense: 'riverbank',
      definition: 'the land along a river',
      example: 'We sat on the bank.',
    })
  })
  it('rejects replies without a definition', () => {
    expect(parseWordInfo('{"partOfSpeech":"noun","definition":"","example":""}')).toBeNull()
    expect(parseWordInfo('not json')).toBeNull()
  })
})

describe('lookupWord', () => {
  const prompts: { input: string; options: Record<string, unknown> }[] = []
  const created: Record<string, unknown>[] = []
  let availability = 'available'

  beforeEach(() => {
    vi.resetModules()
    prompts.length = 0
    created.length = 0
    availability = 'available'
    const session = {
      clone: async () => session,
      prompt: async (input: string, options: Record<string, unknown>) => {
        prompts.push({ input, options })
        return '{"partOfSpeech":"noun","sense":"bank (money)","definition":"a place that keeps money","example":"I went to the bank to open an account."}'
      },
      destroy: () => {},
    }
    globalThis.LanguageModel = {
      availability: async () => availability as never,
      create: async (options: Record<string, unknown> = {}) => {
        created.push(options)
        return session
      },
    }
  })
  afterEach(() => {
    globalThis.LanguageModel = undefined
  })

  it('sends the word with its sentence, a JSON schema and worked examples', async () => {
    const { lookupWord } = await import('../src/core/dictionary')
    const info = await lookupWord('bank', 'en', { context: 'I need to go to the bank before it closes.' })
    expect(info).toEqual({ partOfSpeech: 'noun', sense: 'bank (money)', definition: 'a place that keeps money', example: 'I went to the bank to open an account.' })
    expect(prompts[0].input).toBe('Word: bank\nSentence: I need to go to the bank before it closes.')
    expect(prompts[0].options.responseConstraint).toMatchObject({ required: ['partOfSpeech', 'sense', 'definition', 'example'] })
    const initial = created[0].initialPrompts as { role: string }[]
    expect(initial[0].role).toBe('system')
    expect(initial.length).toBeGreaterThan(3)
  })

  it('stays quiet (null) when the model is not ready or the language is unsupported', async () => {
    const { lookupWord } = await import('../src/core/dictionary')
    expect(await lookupWord('你好', 'zh-Hant')).toBeNull()
    availability = 'downloadable'
    expect(await lookupWord('bank', 'en')).toBeNull()
    expect(prompts).toHaveLength(0)
    expect(created).toHaveLength(0)
  })
})
