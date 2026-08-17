import { useState, useEffect, useRef } from 'react'
import type { Detected, Monitor, LanguageDetectorStatic } from '../types/translator'
import { DEBOUNCE_DEFAULT_WAIT } from '../constants'

declare const LanguageDetector: LanguageDetectorStatic

export const useDetector = (text: string) => {
  const [detected, setDetected] = useState<Detected | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!text.trim()) return

    let cancelled = false

    const run = async () => {
      if (!cancelled) setLoading(true)
      try {
        const availability = await LanguageDetector.availability()
        if (availability === 'unavailable') {
          if (!cancelled) setDetected({ language: '' })
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
        if (cancelled) return

        if (results.length === 0) {
          setDetected({ language: '' })
          return
        }

        const best = results.reduce((a, b) => (b.confidence > a.confidence ? b : a))
        setDetected({ language: best.detectedLanguage })
      } catch (err) {
        if (!cancelled) {
          console.error('Detection error', err)
          setDetected({ language: '' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(run, DEBOUNCE_DEFAULT_WAIT)

    return () => {
      cancelled = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [text])

  return { detected, loading }
}
