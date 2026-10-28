import { useEffect, useState } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import { useSettings } from '../hooks/useSettings'
import { isTranslatorSupported } from '../core/translate'
import { setTargetLanguage } from '../core/settings'
import SourcePanel from './SourcePanel'
import TargetPanel from './TargetPanel'
import Divider from './Divider'
import HighlightBar from './HighlightBar'
import WritingBar from './WritingBar'

// sidepanel.html is the same app with this class on <body>.
const isSidePanel = document.body.classList.contains('side-panel')

export default function Panel() {
  const { settings, loaded, update } = useSettings()
  // Popup-local language choices, seeded from settings once they load. Picking a target
  // explicitly also saves it (so highlight-to-translate follows); swapping doesn't.
  const [srcLang, setSrcLang] = useState('')
  const [tgtLang, setTgtLang] = useState(settings.tgtLang)
  const [seeded, setSeeded] = useState(false)
  const [sourceText, setSourceText] = useState('')

  if (loaded && !seeded) {
    setSeeded(true)
    setSrcLang(settings.srcLang)
    setTgtLang(settings.tgtLang)
  }

  const state = useTranslation(sourceText, srcLang, tgtLang)
  const canSwap = state.status === 'done' && Boolean(state.translated) && Boolean(state.sourceLang)

  const chooseTarget = (lang: string) => {
    setTgtLang(lang)
    setTargetLanguage(lang).catch((err) => console.error('[translate-me] Failed to save target language', err))
  }

  const swap = () => {
    if (!canSwap || !state.sourceLang) return
    setSourceText(state.translated)
    // Keep auto-detect on if it was on: the swapped text will be detected as the old
    // target language anyway, and the user isn't silently locked into a fixed source.
    if (srcLang) setSrcLang(tgtLang)
    setTgtLang(state.sourceLang)
  }

  // sidePanel.open() must run synchronously inside the click (user gesture), so look the window up beforehand.
  const [windowId, setWindowId] = useState<number | null>(null)
  useEffect(() => {
    if (!isSidePanel) chrome.windows?.getCurrent().then((w) => setWindowId(w.id ?? null))
  }, [])

  const openSidePanel = () => {
    if (windowId === null) return
    chrome.sidePanel
      .open({ windowId })
      .then(() => window.close())
      .catch((err) => console.error('[translate-me] Could not open side panel', err))
  }

  return (
    <>
      <header className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-800">translate me</span>
        <div className="flex items-center gap-1">
          {!isSidePanel && chrome.sidePanel && windowId !== null && (
            <button type="button" onClick={openSidePanel} className="text-xs text-zinc-500 hover:text-zinc-800 px-1.5 py-0.5 rounded hover:bg-zinc-100 cursor-pointer">
              Side panel
            </button>
          )}
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="text-xs text-zinc-500 hover:text-zinc-800 px-1.5 py-0.5 rounded hover:bg-zinc-100 cursor-pointer"
          >
            Settings
          </button>
        </div>
      </header>

      {!isTranslatorSupported() && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          Chrome&apos;s built-in translator isn&apos;t available here. It needs desktop Chrome 138 or newer.
        </p>
      )}

      <HighlightBar settings={settings} update={update} />

      <SourcePanel language={srcLang} onLanguageChange={setSrcLang} text={sourceText} onTextChange={setSourceText} state={state} />
      <WritingBar text={sourceText} lang={srcLang || state.detection?.language || null} enabled={settings.writingTools} onUse={setSourceText} />
      <Divider onClickAction={swap} allowToggle={canSwap} withButton={true} />
      <TargetPanel language={tgtLang} onLanguageChange={chooseTarget} recentLangs={settings.recentLangs} state={state} />
    </>
  )
}
