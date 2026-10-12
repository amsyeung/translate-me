import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranslatorStatic } from '../src/types/translator'

// Fresh module per test so the translator cache starts empty.
async function load(api: Partial<TranslatorStatic>) {
  vi.resetModules()
  globalThis.Translator = api as TranslatorStatic
  return import('../src/core/translate')
}

afterEach(() => {
  globalThis.Translator = undefined
})

const instance = (prefix = '') => ({
  sourceLanguage: 'en',
  targetLanguage: 'ja',
  translate: vi.fn(async (t: string) => `${prefix}${t}`),
  translateStreaming: vi.fn(),
  destroy: vi.fn(),
})

describe('translate()', () => {
  it('creates one translator per pair and reuses it', async () => {
    const create = vi.fn(async () => instance('ja:'))
    const { translate } = await load({ availability: async () => 'available', create })
    expect(await translate('a', 'en', 'ja')).toBe('ja:a')
    expect(await translate('b', 'en', 'ja')).toBe('ja:b')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('preserves line structure and blank lines', async () => {
    const { translate } = await load({ availability: async () => 'available', create: async () => instance('>') })
    expect(await translate('one\n\n  two\nthree', 'en', 'ja')).toBe('>one\n\n  >two\n>three')
  })

  it('maps NotAllowedError (no user activation) to needs-activation and does not cache the failure', async () => {
    let allowed = false
    const create = vi.fn(async () => {
      if (!allowed) throw new DOMException('Requires user activation', 'NotAllowedError')
      return instance()
    })
    const { translate, TranslateError } = await load({ availability: async () => 'downloadable', create })
    const err = await translate('x', 'en', 'ja').catch((e) => e)
    expect(err).toBeInstanceOf(TranslateError)
    expect(err.code).toBe('needs-activation')
    allowed = true
    expect(await translate('x', 'en', 'ja')).toBe('x')
  })

  it('reports unavailable pairs and same-language / unknown source', async () => {
    const { translate } = await load({ availability: async () => 'unavailable', create: vi.fn() })
    await expect(translate('x', 'en', 'xx')).rejects.toMatchObject({ code: 'pair-unavailable' })
    await expect(translate('x', 'en', 'en')).rejects.toMatchObject({ code: 'same-language' })
    await expect(translate('x', '', 'en')).rejects.toMatchObject({ code: 'unknown-source' })
  })

  it('forwards download progress while creating, and stops holding listeners once ready', async () => {
    let fire: ((loaded: number) => void) | null = null
    const create = vi.fn(async (opts: { monitor?: (m: EventTarget) => void }) => {
      const target = new EventTarget()
      opts.monitor?.(target)
      fire = (loaded) => target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }))
      await new Promise((r) => setTimeout(r, 5))
      fire(1)
      return instance()
    })
    const { translate } = await load({ availability: async () => 'downloadable', create: create as never })
    const progress = vi.fn()
    await translate('x', 'en', 'ja', { onProgress: progress })
    expect(progress).toHaveBeenCalledWith(1)

    const later = vi.fn()
    await translate('y', 'en', 'ja', { onProgress: later })
    fire!(0.5) // a stray event after the model is ready must not reach new callers
    expect(later).not.toHaveBeenCalled()
  })
})
