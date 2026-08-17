import { useState, useEffect } from 'react'
import { useTranslator } from '../hooks/useTranslator'
import { useDetector } from '../hooks/useDetector'
import SourcePanel from './SourcePanel'
import TargetPanel from './TargetPanel'
import Divider from './Divider'
import { DEFAULT_TARGET_LANG } from '../constants'
import type { ExtensionStorage } from '../types/storage'

export default function Panel() {
  const [srcLang, setSrcLang] = useState('')
  const [tgtLang, setTgtLang] = useState(DEFAULT_TARGET_LANG)
  const [sourceText, setSourceText] = useState('')

  // Detect language as user types
  const { detected } = useDetector(sourceText)
  const { result: translation, loading: translating } = useTranslator(sourceText, (srcLang || detected?.language) ?? '', tgtLang)

  // Derived, not stored: sourceText can be cleared after `translation` was
  // already set, and this must reflect that immediately rather than lag a render.
  const translatedText = translation && sourceText ? translation.translated : ''
  const allowToggle = Boolean(translation) && Boolean(sourceText)

  const toggle = () => {
    setSourceText(translatedText)
    setSrcLang(tgtLang)
    setTgtLang((srcLang || detected?.language) ?? '')
  }

  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.sync.get({ srcLang: '' }, (data: Pick<ExtensionStorage, 'srcLang'>) => setSrcLang(data.srcLang))
      chrome.storage.sync.get({ tgtLang: DEFAULT_TARGET_LANG }, (data: Pick<ExtensionStorage, 'tgtLang'>) => setTgtLang(data.tgtLang))
    }
  }, [])

  return (
    <>
      <SourcePanel
        language={srcLang}
        onLanguageChange={setSrcLang}
        text={sourceText}
        onTextChange={setSourceText}
        detectedLang={detected?.language ?? ''}
      />
      <Divider onClickAction={toggle} allowToggle={allowToggle} withButton={true} />
      <TargetPanel language={tgtLang} onLanguageChange={setTgtLang} text={translatedText} isLoading={translating} targetLang={tgtLang} />
    </>
  )
}
