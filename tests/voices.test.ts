import { describe, expect, it } from 'vitest'
import { chunkForSpeech, localesFor, pickVoice, rankVoices } from '../src/core/voices'
import { historyToCsv } from '../src/core/history'
import { withRecent } from '../src/core/settings'

// A realistic Windows + Chrome voice list.
const windowsVoices = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Tracy - Chinese (Traditional, Hong Kong S.A.R.)', lang: 'zh-HK' },
  { name: 'Microsoft Hanhan - Chinese (Traditional, Taiwan)', lang: 'zh-TW' },
  { name: 'Google US English', lang: 'en-US', remote: true },
  { name: 'Google UK English Female', lang: 'en-GB', remote: true },
  { name: 'Google 普通话（中国大陆）', lang: 'zh-CN', remote: true },
  { name: 'Google 粤語（香港）', lang: 'zh-HK', remote: true },
  { name: 'Google 國語（臺灣）', lang: 'zh-TW', remote: true },
  { name: 'Google 日本語', lang: 'ja-JP', remote: true },
]

describe('localesFor', () => {
  it('puts the user’s own locale first (HK user → Cantonese)', () => {
    expect(localesFor('zh-Hant', ['zh-HK', 'en-US'])[0]).toBe('zh-HK')
  })
  it('keeps the default order otherwise (TW first)', () => {
    expect(localesFor('zh-Hant', ['en-US'])[0]).toBe('zh-TW')
  })
})

describe('rankVoices / pickVoice', () => {
  it('Traditional Chinese for a Hong Kong user picks a Cantonese voice, preferring Google', () => {
    expect(pickVoice(windowsVoices, 'zh-Hant', undefined, ['zh-HK'])?.voice.name).toBe('Google 粤語（香港）')
  })
  it('Simplified Chinese picks Mandarin', () => {
    expect(pickVoice(windowsVoices, 'zh', undefined, [])?.voice.lang).toBe('zh-CN')
  })
  it('respects the user’s saved voice', () => {
    expect(pickVoice(windowsVoices, 'en', 'Microsoft Zira - English (United States)', [])?.voice.name).toBe('Microsoft Zira - English (United States)')
  })
  it('ignores a saved voice that is no longer installed', () => {
    expect(pickVoice(windowsVoices, 'en', 'Samantha', [])?.voice.name).toBe('Google US English')
  })
  it('returns null instead of an unrelated-language voice', () => {
    expect(pickVoice(windowsVoices, 'vi', undefined, [])).toBeNull()
  })
  it('falls back to another region of the same language', () => {
    const r = rankVoices([{ name: 'Daniel', lang: 'en-GB' }], 'en', [])
    expect(r[0]).toMatchObject({ quality: 'region' })
    const fr = rankVoices([{ name: 'Amélie', lang: 'fr-CA' }, { name: 'X', lang: 'fr-LU' }], 'fr', [])
    expect(fr.map((v) => v.voice.name)).toEqual(['Amélie', 'X'])
    expect(fr[1].quality).toBe('family')
  })
  it('handles underscore locales', () => {
    expect(pickVoice([{ name: 'A', lang: 'ja_JP' }], 'ja', undefined, [])?.voice.name).toBe('A')
  })
})

describe('chunkForSpeech', () => {
  it('keeps short text whole', () => expect(chunkForSpeech('Hello there.')).toEqual(['Hello there.']))
  it('splits on sentences under the limit', () => {
    const text = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i} of the test.`).join(' ')
    const chunks = chunkForSpeech(text, 100)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 100)).toBe(true)
    expect(chunks.join(' ')).toBe(text)
  })
  it('splits CJK text without spaces', () => {
    const text = '這是一個很長的句子，'.repeat(30)
    const chunks = chunkForSpeech(text, 50)
    expect(chunks.every((c) => c.length <= 50)).toBe(true)
    expect(chunks.join('')).toBe(text)
  })
})

describe('misc', () => {
  it('withRecent keeps unique, newest-first, max 5', () => {
    expect(withRecent(['ja', 'en', 'fr', 'de', 'ko'], 'en')).toEqual(['en', 'ja', 'fr', 'de', 'ko'])
    expect(withRecent(['ja', 'en', 'fr', 'de', 'ko'], 'vi')).toHaveLength(5)
  })
  it('historyToCsv escapes quotes and newlines', () => {
    const csv = historyToCsv([{ text: 'say "hi"', translated: 'line1\nline2', src: 'en', tgt: 'ja', site: 'x.com', at: 0 }])
    expect(csv.split('\r\n')[1]).toBe('"say ""hi""","line1\nline2","en","ja","x.com","1970-01-01T00:00:00.000Z"')
  })
})
