import { useState, useEffect } from 'react'
import { useTranslator } from '../hooks/useTranslator'
import { useDetector } from '../hooks/useDetector'
import SourcePanel from './SourcePanel'
import TargetPanel from './TargetPanel'
import Divider from './Divider'

export default function Panel() {
  const [srcLang, setSrcLang] = useState('')
  const [tgtLang, setTgtLang] = useState('en')
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [allowToggle, setAllowToggle] = useState(false)

  // Detect language as user types
  const { detected } = useDetector(sourceText)
  const { result: translation, loading: translating } = useTranslator(sourceText, (srcLang || detected?.language) ?? '', tgtLang)

  const toggle = () => {
    setSourceText(translatedText)
    setSrcLang(tgtLang)
    setTgtLang((srcLang || detected?.language) ?? '')
  }

  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.sync.get({ srcLang: '' }, (data: Storage) => setSrcLang(data.srcLang))
      chrome.storage.sync.get({ tgtLang: 'en' }, (data: Storage) => setTgtLang(data.tgtLang))
    }
  }, [])

  useEffect(() => {
    if (translation) {
      if (!sourceText) {
        setAllowToggle(false)
        setTranslatedText('')
      } else {
        setAllowToggle(true)
        setTranslatedText(translation.translated)
      }
    }
  }, [translation, translating, detected, sourceText, translatedText, srcLang, tgtLang, allowToggle])

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
      <TargetPanel language={tgtLang} onLanguageChange={setTgtLang} text={translatedText} isLoading={translating} detectedLang={tgtLang} />
    </>
  )
}
