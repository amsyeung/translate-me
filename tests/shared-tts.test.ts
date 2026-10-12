import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/core/settings'
import { SHARED_TTS_URL } from '../src/constants'
import { synthesizeShared } from '../src/background/tts/shared'
import { CloudTtsError } from '../src/background/tts/cloud'

// No IndexedDB in Node: the audio cache quietly misses, so every chunk hits the "server".
vi.spyOn(console, 'warn').mockImplementation(() => {})

afterEach(() => vi.unstubAllGlobals())

function stubServer(handler: (body: { text: string; locales: string[]; voice?: string; rate: number }) => Response) {
  const calls: { url: string; body: { text: string; locales: string[]; voice?: string; rate: number } }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      calls.push({ url, body })
      return handler(body)
    })
  )
  return calls
}

const mp3 = (s: string) => new Response(new TextEncoder().encode(s), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })

describe('synthesizeShared', () => {
  it('posts the text, locales, chosen voice and prosody', async () => {
    const calls = stubServer(() => mp3('A'))
    const settings = { ...DEFAULT_SETTINGS, rate: 0.9, sharedVoicePrefs: { 'zh-Hant': 'zh-HK-WanLungNeural' } }
    const audio = await synthesizeShared('你好', 'zh-Hant', settings)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${SHARED_TTS_URL}/v1/tts`)
    expect(calls[0].body).toMatchObject({ text: '你好', voice: 'zh-HK-WanLungNeural', rate: 0.9 })
    expect(calls[0].body.locales[0]).toMatch(/^zh-/)
    expect(audio.mime).toBe('audio/mpeg')
    expect(new TextDecoder().decode(audio.data)).toBe('A')
  })

  it('splits long text under the server limit and joins the audio in order', async () => {
    let n = 0
    const calls = stubServer(() => mp3(String(n++)))
    const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here to make the text long enough.`).join(' ')
    const audio = await synthesizeShared(text, 'en', DEFAULT_SETTINGS)
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.every((c) => c.body.text.length <= 280)).toBe(true)
    expect(new TextDecoder().decode(audio.data)).toBe(Array.from({ length: calls.length }, (_, i) => i).join(''))
  })

  it('refuses very long text so the caller uses the browser voice', async () => {
    const calls = stubServer(() => mp3('x'))
    await expect(synthesizeShared('word '.repeat(600), 'en', DEFAULT_SETTINGS)).rejects.toBeInstanceOf(CloudTtsError)
    expect(calls).toHaveLength(0)
  })

  it('turns server errors into a readable fallback reason', async () => {
    stubServer(() => new Response(JSON.stringify({ error: 'daily_budget', message: 'The shared daily character budget is used up' }), { status: 429 }))
    await expect(synthesizeShared('hello', 'en', DEFAULT_SETTINGS)).rejects.toThrow('Shared voices: The shared daily character budget is used up')
  })

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(synthesizeShared('hello', 'en', DEFAULT_SETTINGS)).rejects.toThrow('server unreachable')
  })
})
