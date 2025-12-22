import { useState, useEffect } from 'react'
import type { Detected, Monitor, LanguageDetectorStatic } from '@/types/translator'

declare const LanguageDetector: LanguageDetectorStatic

export const useDetector = (text: string) => {
  const [detected, setDetected] = useState<Detected | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!text.trim()) return

    const run = async () => {
      setLoading(true)
      try {
        const availability = await LanguageDetector.availability()
        if (availability === 'unavailable') {
          setDetected({ language: '' })
          return
        }

        let detector
        if (availability === 'downloadable') {
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
          detector = await LanguageDetector.create({})
        }

        const results = await detector.detect(text)
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
