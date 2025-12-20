import { useState, useEffect } from 'react'

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

export type Detected = {
  language: string
}

export const useDetector = (text: string) => {
  const [detected, setDetected] = useState<Detected | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!text.trim()) return

    const run = async () => {
      setLoading(true)
      try {
        // @ts-ignore
        const availability = await LanguageDetector.availability()
        if (availability === 'unavailable') {
          setDetected({ language: '' })
          return
        }

        let detector
        if (availability === 'downloadable') {
          // @ts-ignore
          detector = await LanguageDetector.create({
            sourceLanguage: '',
            targetLanguage: '',
            monitor(m: Monitor) {
              m.addEventListener('downloadprogress', (e) => {
                console.log(`Download ${e.loaded * 100}%`)
              })
            },
          })
        } else {
          // @ts-ignore
          detector = await LanguageDetector.create({})
        }

        const results = await detector.detect(text)
        // @ts-ignore
        const best = results.reduce((a, b) => (!a || b.confidence > a.confidence ? b : a))
        setDetected({ language: best?.detectedLanguage ?? '' })
      } catch (err) {
        console.error('Detection error', err)
        setDetected({ language: '' })
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [text])

  return { detected, loading }
}
