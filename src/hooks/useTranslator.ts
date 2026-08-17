import { useEffect, useRef, useState } from 'react'
import type { TranslatorResult, Monitor, TranslatorStatic } from '../types/translator'
import { DEBOUNCE_DEFAULT_WAIT } from '../constants'

declare const Translator: TranslatorStatic;

export const useTranslator = (sourceText: string, srcLang: string, tgtLang: string) => {
  const [asyncResult, setAsyncResult] = useState<TranslatorResult | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Source and target are the same language: this is a pure passthrough, computed
  // every render rather than pushed through setState from inside the effect below.
  const isIdentity = Boolean(srcLang) && Boolean(tgtLang) && srcLang === tgtLang

  useEffect(() => {
    if (!srcLang || !tgtLang || sourceText.trim() === '' || isIdentity) return

    let cancelled = false

    const run = async () => {
      try {
        const availability = await Translator.availability({
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
        })

        let translator
        if (availability === 'downloadable') {
          if (!cancelled) setLoading(true)
          translator = await Translator.create({
            sourceLanguage: srcLang,
            targetLanguage: tgtLang,
            monitor(m: Monitor) {
              m.addEventListener('downloadprogress', (e) => {
                console.log(`Download ${e.loaded * 100}%`)
              })
            },
          })
        } else if (availability === 'unavailable') {
          // fallback – echo original
          if (!cancelled) setAsyncResult({ translated: sourceText })
          return
        } else {
          translator = await Translator.create({
            sourceLanguage: srcLang,
            targetLanguage: tgtLang,
          })
        }

        const t = await translator.translate(sourceText)
        if (!cancelled) setAsyncResult({ translated: t })
      } catch (err) {
        console.error('Translation error', err)
        if (!cancelled) setAsyncResult({ translated: sourceText }) // fallback
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(run, DEBOUNCE_DEFAULT_WAIT)

    return () => {
      cancelled = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [sourceText, srcLang, tgtLang, isIdentity])

  const result = isIdentity ? { translated: sourceText } : asyncResult

  return { result, loading }
}
