import { useEffect, useRef, useState } from 'react'

interface Monitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (this: Monitor, ev: DownloadProgressEventTarget) => void,
    options?: boolean | AddEventListenerOptions
  ): void
}

interface DownloadProgressEventTarget extends EventTarget {
  loaded: number
}

export type TranslatorResult = {
  translated: string
}

export const useTranslator = (sourceText: string, srcLang: string, tgtLang: string) => {
  const [result, setResult] = useState<TranslatorResult | null>(null)
  const [loading, setLoading] = useState(false)
  // @ts-ignore
  const timerRef = useRef<NodeJS.Timeout | null>(null)

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
        // @ts-ignore
        const availability = await Translator.availability({
          sourceLanguage: srcLang,
          targetLanguage: tgtLang,
        })

        let translator
        if (availability === 'downloadable') {
          setLoading(true)
          // @ts-ignore
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
          // @ts-ignore
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

    // run()

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
