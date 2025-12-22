import { useEffect, useRef, useState } from 'react'
import type { TranslatorResult, Monitor, TranslatorStatic } from '@/types/translator'

declare const Translator: TranslatorStatic;

export const useTranslator = (sourceText: string, srcLang: string, tgtLang: string) => {
  const [result, setResult] = useState<TranslatorResult | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // console.log(`srcLang: ${srcLang}`)
    // console.log(`tgtLang: ${tgtLang}`)
    if (!srcLang || !tgtLang || sourceText.trim() === '') return

    if (srcLang === tgtLang) {
      setResult({ translated: sourceText })
      return
    }

    const run = async () => {
      try {
        const availability = await Translator.availability({
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
        })

        let translator
        if (availability === 'downloadable') {
          setLoading(true)
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
          setResult({ translated: sourceText })
          return
        } else {
          translator = await Translator.create({
            sourceLanguage: srcLang,
            targetLanguage: tgtLang,
          })
        }

        const t = await translator.translate(sourceText)
        setResult({ translated: t })
      } catch (err) {
        console.error('Translation error', err)
        setResult({ translated: sourceText }) // fallback
      } finally {
        setLoading(false)
      }
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(run, 300)

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [sourceText, srcLang, tgtLang])

  return { result, loading }
}
