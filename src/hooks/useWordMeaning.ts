import { useEffect, useState } from 'react'
import { DEBOUNCE_DEFAULT_WAIT } from '../constants'
import { dictionaryReady, isWordLike, lookupWord, type WordInfo } from '../core/dictionary'
import { translate } from '../core/translate'

export type WordMeaning = { status: 'loading' } | ({ status: 'done'; translatedSense: string; translatedDefinition: string } & WordInfo)

/** The meaning of a single word typed in the popup (on-device model), or null for anything else. */
export function useWordMeaning(text: string, sourceLang: string | null, tgtLang: string, enabled: boolean): WordMeaning | null {
  const [meaning, setMeaning] = useState<{ key: string; value: WordMeaning } | null>(null)
  const word = text.trim()
  const key = `${word}|${sourceLang}|${tgtLang}`
  const wanted = enabled && Boolean(sourceLang) && isWordLike(word, sourceLang ?? '')

  useEffect(() => {
    if (!wanted || !sourceLang) return
    const controller = new AbortController()
    const { signal } = controller
    const timer = setTimeout(async () => {
      if (!(await dictionaryReady(sourceLang)) || signal.aborted) return
      setMeaning({ key, value: { status: 'loading' } })
      const info = await lookupWord(word, sourceLang, { signal }).catch(() => null)
      if (signal.aborted) return
      if (!info) return setMeaning(null)
      const sameLanguage = sourceLang.split('-')[0] === tgtLang.split('-')[0]
      const [translatedSense, translatedDefinition] = sameLanguage
        ? ['', '']
        : await Promise.all([info.sense, info.definition].map((t) => (t ? translate(t, sourceLang, tgtLang, { signal }).catch(() => '') : '')))
      if (!signal.aborted) setMeaning({ key, value: { status: 'done', ...info, translatedSense, translatedDefinition } })
    }, DEBOUNCE_DEFAULT_WAIT)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [wanted, key, word, sourceLang, tgtLang])

  // Only show the meaning that belongs to the current word.
  return wanted && meaning?.key === key ? meaning.value : null
}
