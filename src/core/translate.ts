import type { TranslatorInstance } from '../types/translator'

export type TranslateErrorCode = 'api-unavailable' | 'pair-unavailable' | 'same-language' | 'unknown-source' | 'needs-activation'

export class TranslateError extends Error {
  readonly code: TranslateErrorCode
  constructor(code: TranslateErrorCode, message: string) {
    super(message)
    this.name = 'TranslateError'
    this.code = code
  }
}

export function isTranslatorSupported(): boolean {
  return typeof globalThis.Translator !== 'undefined'
}

type ProgressListener = (fraction: number) => void

// One Translator per language pair, reused across calls. Creating one loads the model
// into memory, which is by far the slowest part of a translation after the first.
const translators = new Map<string, Promise<TranslatorInstance>>()
// Progress listeners only exist while a pair's model is being created; once it's ready
// nobody is added, so callers' closures aren't retained forever.
const progressListeners = new Map<string, Set<ProgressListener>>()
const ready = new Set<string>()

const pairKey = (src: string, tgt: string) => `${src}→${tgt}`

function getTranslator(src: string, tgt: string, onProgress?: ProgressListener): Promise<TranslatorInstance> {
  const key = pairKey(src, tgt)

  if (onProgress && !ready.has(key)) {
    let set = progressListeners.get(key)
    if (!set) progressListeners.set(key, (set = new Set()))
    set.add(onProgress)
  }

  let pending = translators.get(key)
  if (!pending) {
    pending = (async () => {
      const api = globalThis.Translator
      if (!api) throw new TranslateError('api-unavailable', 'Chrome built-in Translator is not available (Chrome 138+ on desktop required)')
      const availability = await api.availability({ sourceLanguage: src, targetLanguage: tgt })
      if (availability === 'unavailable') throw new TranslateError('pair-unavailable', `Translation from ${src} to ${tgt} is not available`)
      try {
        return await api.create({
          sourceLanguage: src,
          targetLanguage: tgt,
          monitor(m) {
            m.addEventListener('downloadprogress', (e) => progressListeners.get(key)?.forEach((fn) => fn(e.loaded)))
          },
        })
      } catch (err) {
        // Downloading a model requires a recent click/keypress in the page; shortcuts and
        // context menus don't count. The caller must ask the user to click.
        if ((err as Error)?.name === 'NotAllowedError') throw new TranslateError('needs-activation', 'The language model must be downloaded first')
        throw err
      }
    })()
    translators.set(key, pending)
    pending.then(
      () => ready.add(key),
      // A failed create (no user activation yet, network hiccup) shouldn't poison the cache.
      () => translators.delete(key)
    )
    pending.finally(() => progressListeners.delete(key)).catch(() => {})
  }
  return pending
}

export interface TranslateOptions {
  signal?: AbortSignal
  /** Model download progress, 0..1. Only fires the first time a pair is used. */
  onProgress?: ProgressListener
}

/**
 * Translate `text` from `src` to `tgt` (Translator API tags). Line structure is
 * preserved: each non-blank line is translated separately, which keeps lists and
 * paragraphs intact and keeps each request well inside the model's input quota.
 */
export async function translate(text: string, src: string, tgt: string, options: TranslateOptions = {}): Promise<string> {
  if (!src) throw new TranslateError('unknown-source', 'Source language is unknown')
  if (src === tgt) throw new TranslateError('same-language', 'Text is already in the target language')

  const translator = await getTranslator(src, tgt, options.onProgress)
  options.signal?.throwIfAborted()

  const lines = text.split(/(\r?\n)/)
  const out: string[] = []
  for (const line of lines) {
    if (!line.trim() || /^\r?\n$/.test(line)) {
      out.push(line)
      continue
    }
    const leading = line.match(/^\s*/)?.[0] ?? ''
    out.push(leading + (await translator.translate(line.trim(), { signal: options.signal })))
  }
  return out.join('')
}

/** Create (downloading if needed) the model for a pair ahead of time. Must run inside a user gesture if it downloads. */
export async function prepareTranslator(src: string, tgt: string, onProgress?: ProgressListener): Promise<void> {
  await getTranslator(src, tgt, onProgress)
}

/** Ask whether a pair is usable without downloading anything. */
export async function pairAvailability(src: string, tgt: string) {
  if (!globalThis.Translator) return 'unavailable' as const
  return globalThis.Translator.availability({ sourceLanguage: src, targetLanguage: tgt })
}
