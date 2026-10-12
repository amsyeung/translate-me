import { describe, expect, it } from 'vitest'
import { chineseVariant, detectByScript, detectLanguage, pickFromModel } from '../src/core/detect'
import { normalizeLanguageTag } from '../src/core/languages'

describe('normalizeLanguageTag', () => {
  it.each([
    ['en-US', 'en'],
    ['EN', 'en'],
    ['zh', 'zh'],
    ['zh-CN', 'zh'],
    ['zh-Hans', 'zh'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh_HK', 'zh-Hant'],
    ['zh-Hant-HK', 'zh-Hant'],
    ['yue', 'zh-Hant'],
    ['iw', 'he'],
    ['nb', 'no'],
    ['vi', 'vi'],
    ['uk', 'uk'],
    ['pt-BR', 'pt'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLanguageTag(input)).toBe(expected)
  })

  it.each(['und', '', 'zh-Latn', 'ja-Latn', 'hi-Latn', 'fil', 'fa', 'xx'])('%s → null (not translatable)', (input) => {
    expect(normalizeLanguageTag(input)).toBeNull()
  })
})

describe('chineseVariant', () => {
  it('recognises Traditional', () => expect(chineseVariant('這個問題我們會處理')).toBe('zh-Hant'))
  it('recognises Simplified', () => expect(chineseVariant('这个问题我们会处理')).toBe('zh'))
  it('is undecided on shared characters', () => expect(chineseVariant('中文')).toBeNull())
  it('ignores characters normal in both scripts', () => expect(chineseVariant('批准制度')).toBeNull())
})

describe('detectByScript', () => {
  it('kana means Japanese even with mostly kanji', () => expect(detectByScript('東京都の会議室')).toBe('ja'))
  it('kanji-only text follows a Japanese page hint', () => expect(detectByScript('東京都', ['ja'])).toBe('ja'))
  it('kanji-only text without a hint is Chinese', () => expect(detectByScript('東京都', ['en'])).toMatch(/^zh/))
  it('Traditional Chinese', () => expect(detectByScript('我們這裡說廣東話')).toBe('zh-Hant'))
  it('Simplified Chinese', () => expect(detectByScript('我们这里说普通话')).toBe('zh'))
  it('Korean', () => expect(detectByScript('안녕하세요')).toBe('ko'))
  it('Thai', () => expect(detectByScript('สวัสดีครับ')).toBe('th'))
  it('Greek', () => expect(detectByScript('Καλημέρα')).toBe('el'))
  it('Hebrew', () => expect(detectByScript('שלום')).toBe('he'))
  it('leaves Latin script to the model', () => expect(detectByScript('Bonjour tout le monde')).toBeNull())
  it('leaves Cyrillic to the model', () => expect(detectByScript('Привет')).toBeNull())
  it('mostly-English text with one CJK word is not Chinese', () => expect(detectByScript('I had dim sum (點心) today with friends')).toBeNull())
})

describe('pickFromModel', () => {
  it('takes a confident answer', () => {
    expect(pickFromModel([{ detectedLanguage: 'fr', confidence: 0.92 }]).language).toBe('fr')
  })
  it('returns null for undetermined output instead of guessing English', () => {
    expect(pickFromModel([{ detectedLanguage: 'und', confidence: 0.9 }]).language).toBeNull()
  })
  it('drops unsupported languages and uses the next supported one', () => {
    const r = pickFromModel([
      { detectedLanguage: 'fa', confidence: 0.5 },
      { detectedLanguage: 'ar', confidence: 0.45 },
    ])
    expect(r.language).toBe('ar')
  })
  it('lets a hint break a tie on ambiguous short text', () => {
    const r = pickFromModel(
      [
        { detectedLanguage: 'fr', confidence: 0.45 },
        { detectedLanguage: 'en', confidence: 0.35 },
      ],
      ['en']
    )
    expect(r).toMatchObject({ language: 'en', source: 'hint' })
  })
  it('never lets a hint override a confident result', () => {
    expect(pickFromModel([{ detectedLanguage: 'de', confidence: 0.95 }], ['en']).language).toBe('de')
  })
  it('merges variants that map to the same tag', () => {
    const r = pickFromModel([
      { detectedLanguage: 'zh-TW', confidence: 0.4 },
      { detectedLanguage: 'zh-Hant', confidence: 0.35 },
      { detectedLanguage: 'ja', confidence: 0.25 },
    ])
    expect(r.language).toBe('zh-Hant')
  })
  it('returns null when nothing is plausible', () => {
    expect(pickFromModel([{ detectedLanguage: 'en', confidence: 0.2 }]).language).toBeNull()
  })
})

describe('detectLanguage', () => {
  it('needs no model for script-identifiable text', async () => {
    expect(await detectLanguage('ありがとうございます')).toMatchObject({ language: 'ja', source: 'script' })
  })
  it('returns null for text with no letters', async () => {
    expect((await detectLanguage('123 — !!! https://example.com')).language).toBeNull()
  })
  it('falls back to the first hint when the model is unavailable', async () => {
    expect((await detectLanguage('hello world', { hints: ['en'] })).language).toBe('en')
  })
})
