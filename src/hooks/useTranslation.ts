import { useEffect, useState } from 'react'
import { DEBOUNCE_DEFAULT_WAIT } from '../constants'
import { detectLanguage, type Detection } from '../core/detect'
import { languageName, preferredLanguages } from '../core/languages'
import { translate, TranslateError } from '../core/translate'

export type TranslationStatus = 'idle' | 'working' | 'downloading' | 'done' | 'error'

export interface TranslationState {
  status: TranslationStatus
  /** Result of auto-detection; null while detecting or when a source language is forced. */
  detection: Detection | null
  /** The source language actually used (forced or detected). */
  sourceLang: string | null
  translated: string
  /** Model download progress 0..1, while status === 'downloading'. */
  progress: number
  error: string | null
}

const IDLE: TranslationState = { status: 'idle', detection: null, sourceLang: null, translated: '', progress: 0, error: null }

function describeError(err: unknown, tgtLang: string): string {
  if (err instanceof TranslateError) {
    switch (err.code) {
      case 'unknown-source':
        return "Couldn't tell which language this is — pick the source language above."
      case 'same-language':
        return `This text is already in ${languageName(tgtLang)}. Choose another target language.`
      case 'pair-unavailable':
        return 'Chrome cannot translate between these two languages on this device.'
      case 'needs-activation':
        return 'Chrome needs to download the language model first. Type or click again to start the download.'
      case 'api-unavailable':
        return 'Chrome built-in translation is not available. It needs desktop Chrome 138 or newer.'
    }
  }
  return 'Translation failed. Please try again.'
}

/**
 * Detect-then-translate pipeline for the popup. Detection and translation run in one
 * debounced task, in order, so translation can never start with the *previous* text's
 * language (the race that made results come out in the wrong language).
 */
export function useTranslation(text: string, srcLang: string, tgtLang: string): TranslationState {
  const [state, setState] = useState<TranslationState>(IDLE)
  const trimmed = text.trim()

  useEffect(() => {
    if (!trimmed || !tgtLang) return

    const controller = new AbortController()
    const { signal } = controller
    const timer = setTimeout(async () => {
      setState((prev) => ({ ...prev, status: 'working', error: null, progress: 0 }))
      let detection: Detection | null = null
      try {
        let source = srcLang
        if (!source) {
          detection = await detectLanguage(text, { hints: preferredLanguages(), signal })
          if (signal.aborted) return
          source = detection.language ?? ''
          setState((prev) => ({ ...prev, detection, sourceLang: source || null }))
        }

        const translated = await translate(text, source, tgtLang, {
          signal,
          onProgress: (progress) => !signal.aborted && setState((prev) => ({ ...prev, status: 'downloading', progress })),
        })
        if (signal.aborted) return
        setState({ status: 'done', detection, sourceLang: source, translated, progress: 1, error: null })
      } catch (err) {
        if (signal.aborted || (err as Error)?.name === 'AbortError') return
        if (!(err instanceof TranslateError)) console.error('[translate-me] Translation error', err)
        setState({ status: 'error', detection, sourceLang: srcLang || detection?.language || null, translated: '', progress: 0, error: describeError(err, tgtLang) })
      }
    }, DEBOUNCE_DEFAULT_WAIT)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text, trimmed, srcLang, tgtLang])

  // Cleared input → idle immediately, without waiting for (or keeping) a stale result.
  return trimmed ? state : IDLE
}
