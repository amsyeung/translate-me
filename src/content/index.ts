import { MAX_SELECTION_CHARS } from '../constants'
import { detectLanguage } from '../core/detect'
import { languageName, normalizeLanguageTag, preferredLanguages } from '../core/languages'
import { requestSpeak, sendToBackground, type ContentRequest } from '../core/messages'
import { DEFAULT_SETTINGS, isSiteDisabled, loadSettings, onSettingsChanged, setTargetLanguage, type Settings } from '../core/settings'
import { translate, TranslateError } from '../core/translate'
import { copyToClipboard } from '../util/util'
import { PageTranslator } from './pageTranslate'
import { PopoverUI, type Anchor, type PopoverView } from './popover'

interface Session {
  id: number
  text: string
  anchor: Anchor
  /** Forced source language from the popover's dropdown; '' = auto. */
  srcLang: string
  /** Target for this session (may differ from settings: bilingual pair, context-menu pick). */
  tgtLang: string
  /** Did the user explicitly ask (icon click, shortcut, menu)? Explicit requests always show feedback. */
  explicit: boolean
  view: PopoverView
  controller: AbortController
}

const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

function init() {
  let settings: Settings = DEFAULT_SETTINGS
  let session: Session | null = null
  let seq = 0

  loadSettings().then((s) => (settings = s))
  onSettingsChanged((patch) => {
    settings = { ...settings, ...patch }
    if (!highlightActive() && session && !session.explicit) closeSession()
  })

  const alive = () => Boolean(chrome.runtime?.id) // false once the extension is reloaded/updated

  const ui = new PopoverUI({
    onSourceChange: (lang) => {
      if (!session) return
      session.srcLang = lang
      run(session)
    },
    onTargetChange: (lang) => {
      if (!session) return
      session.tgtLang = lang
      setTargetLanguage(lang).catch(() => {})
      run(session)
    },
    onSpeak: (which) => {
      if (!session) return
      const { view } = session
      if (which === 'source') requestSpeak(session.text, view.srcLang || view.detected || '')
      else requestSpeak(view.translated, view.tgtLang)
    },
    onCopy: () => copyToClipboard(session?.view.translated ?? ''),
    onClose: () => closeSession(),
    onAction: () => session && run(session),
  })
  const pageTranslator = new PageTranslator(ui)

  function highlightActive() {
    return settings.highlightEnabled && !isSiteDisabled(settings, location.hostname)
  }

  function hints(): string[] {
    const page = normalizeLanguageTag(document.documentElement.lang)
    return [...new Set([page, ...preferredLanguages()].filter((t): t is string => Boolean(t)))]
  }

  function closeSession() {
    session?.controller.abort()
    session = null
    ui.close()
  }

  function render(s: Session, patch: Partial<PopoverView>) {
    if (session !== s) return
    s.view = { ...s.view, ...patch }
    if (ui.isOpen) ui.update(s.view)
    else ui.open(s.anchor, s.view, settings.autoHideSeconds)
  }

  /** Quietly drop an automatic popover, or explain the problem when the user explicitly asked. */
  function fail(s: Session, message: string, action?: string) {
    if (!s.explicit && !ui.isOpen && !action) {
      closeSession()
      return
    }
    render(s, { status: 'error', message, action, translated: '' })
  }

  const inFrame = window !== window.top

  async function run(s: Session) {
    s.controller.abort()
    s.controller = new AbortController()
    const { signal } = s.controller
    const id = ++seq
    s.id = id
    const current = () => session === s && s.id === id && !signal.aborted

    // Explicit requests show the card immediately; automatic ones only once there's something worth showing,
    // so selecting text that turns out not to need translating doesn't flash a popover.
    if (s.explicit || ui.isOpen) render(s, { status: 'working', srcLang: s.srcLang, tgtLang: s.tgtLang, message: undefined, action: undefined })

    try {
      let src = s.srcLang
      if (!src) {
        const detection = await detectLanguage(s.text, { hints: hints(), signal })
        if (!current()) return
        s.view.detected = detection.language
        src = detection.language ?? ''
      }
      if (!src) return fail(s, "Couldn't tell which language this is. Choose the source language above.")

      let tgt = s.tgtLang
      if (src === tgt) {
        // Bilingual pair: text already in the main target goes the other way.
        if (settings.pairLang && settings.pairLang !== src) tgt = settings.pairLang
        else return fail(s, `This is already ${languageName(src)}. Choose another target language above.`)
      }

      if (!ui.isOpen) render(s, { status: 'working', srcLang: s.srcLang, tgtLang: tgt })
      const translated = await translate(s.text, src, tgt, {
        signal,
        onProgress: (progress) => current() && render(s, { status: 'downloading', progress }),
      })
      if (!current()) return
      render(s, { status: 'done', translated, tgtLang: tgt, srcLang: s.srcLang })

      if (settings.saveHistory && alive()) {
        sendToBackground({ type: 'add-history', item: { text: s.text, translated, src, tgt, site: location.hostname, at: Date.now() } }).catch(() => {})
      }
    } catch (err) {
      if (!current() || (err as Error)?.name === 'AbortError') return
      if (err instanceof TranslateError) {
        if (err.code === 'needs-activation') {
          return fail(s, `Chrome needs to download the ${languageName(s.view.srcLang || s.view.detected)} → ${languageName(s.view.tgtLang)} model once.`, 'Download')
        }
        // Embedded cross-origin frames need allow="translator" from the page, which most don't grant.
        if (inFrame && (err.code === 'api-unavailable' || err.code === 'pair-unavailable')) {
          return fail(s, "This embedded frame doesn't allow Chrome's translator. Open it in its own tab to translate.")
        }
        if (err.code === 'api-unavailable') return fail(s, "Chrome's built-in translator isn't available here (needs desktop Chrome 138+).")
        if (err.code === 'pair-unavailable') return fail(s, `Chrome can't translate ${languageName(s.view.srcLang || s.view.detected)} → ${languageName(s.view.tgtLang)} on this device.`)
      }
      console.warn('[translate-me] Translation failed', err)
      fail(s, 'Translation failed. Try again.')
    }
  }

  function start(text: string, anchor: Anchor, options: { explicit: boolean; tgtLang?: string }) {
    const clipped = text.length > MAX_SELECTION_CHARS ? `${text.slice(0, MAX_SELECTION_CHARS)}…` : text
    const tgtLang = options.tgtLang ?? settings.tgtLang
    session?.controller.abort()
    session = {
      id: 0,
      text: clipped,
      anchor,
      srcLang: settings.srcLang,
      tgtLang,
      explicit: options.explicit,
      controller: new AbortController(),
      view: { srcLang: settings.srcLang, detected: null, tgtLang, status: 'working', progress: 0, translated: '', sourceText: clipped },
    }
    run(session)
  }

  /** The current selection as text + an anchor that tracks it while scrolling. */
  function readSelection(): { text: string; anchor: Anchor } | null {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && /^(text|search|url|email|)$/.test(active.type))) {
      const { selectionStart: a, selectionEnd: b } = active
      const text = a !== null && b !== null ? active.value.slice(a, b).trim() : ''
      if (!text) return null
      return { text, anchor: { rect: () => active.getBoundingClientRect() } }
    }

    const sel = getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const text = sel.toString().trim()
    if (!text) return null
    const range = sel.getRangeAt(0).cloneRange()
    return {
      text,
      anchor: {
        rect: () => {
          const r = range.getBoundingClientRect()
          return r.width || r.height ? r : null
        },
        centerX: () => {
          const rects = range.getClientRects()
          const last = rects[rects.length - 1]
          return last ? (last.left + last.right) / 2 : undefined
        },
      },
    }
  }

  function selectionInEditable(): boolean {
    const active = document.activeElement
    if (active?.matches(EDITABLE) || (active as HTMLElement | null)?.isContentEditable) return true
    const node = getSelection()?.anchorNode
    const el = node instanceof Element ? node : node?.parentElement
    return Boolean(el?.closest(EDITABLE) || (el as HTMLElement | null)?.isContentEditable)
  }

  // ------------------------------------------------------------------ events

  window.addEventListener(
    'mouseup',
    (e) => {
      if (e.button !== 0 || ui.contains(e) || !alive()) return
      // Let the browser finish updating the selection (double/triple click) first.
      setTimeout(() => {
        if (!highlightActive()) return
        const picked = readSelection()
        if (!picked || !/\p{L}/u.test(picked.text)) return
        if (settings.skipEditable && selectionInEditable()) return
        if (session && ui.isOpen && session.text === picked.text) return

        if (settings.triggerMode === 'auto') start(picked.text, picked.anchor, { explicit: false })
        else if (settings.triggerMode === 'modifier') {
          if (e.altKey) start(picked.text, picked.anchor, { explicit: true })
        } else {
          ui.showIcon({ x: e.clientX, y: e.clientY }, () => start(picked.text, picked.anchor, { explicit: true }))
        }
      }, 10)
    },
    true
  )

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (ui.contains(e)) return
      ui.hideIcon()
      if (ui.isOpen && !ui.isSticky) closeSession()
    },
    true
  )

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return
      if (ui.isIconVisible) ui.hideIcon()
      if (ui.isOpen) closeSession()
    },
    true
  )

  const follow = () => {
    ui.hideIcon()
    if (ui.isOpen) ui.follow(closeSession)
  }
  window.addEventListener('scroll', follow, { capture: true, passive: true })
  window.addEventListener('resize', follow, { passive: true })

  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
    if (msg.type === 'ping') {
      sendResponse(true)
      return
    }
    // Only the frame that actually holds the selection reacts (all frames receive the message).
    if (msg.type === 'translate-selection') {
      // The shortcut is broadcast to every frame; a frame that lost focus may still hold an old selection.
      if (msg.focusedOnly && !document.hasFocus()) return
      const picked = readSelection()
      if (picked) start(picked.text, picked.anchor, { explicit: true, tgtLang: msg.tgtLang })
      return
    }
    if (msg.type === 'translate-page' && window === window.top) {
      if (pageTranslator.isActive) pageTranslator.stop()
      else pageTranslator.start(msg.tgtLang ?? settings.tgtLang).catch((err) => console.warn('[translate-me] Page translation failed', err))
    }
  })
}

// Guard against the script being evaluated twice in the same isolated world. (After an
// extension update, already-open tabs keep the old, orphaned script until they're
// reloaded; alive() makes it go inert rather than throw.)
const FLAG = '__translateMeLoaded'
if (!(window as unknown as Record<string, boolean>)[FLAG]) {
  ;(window as unknown as Record<string, boolean>)[FLAG] = true
  init()
}
