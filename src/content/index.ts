import { MAX_SELECTION_CHARS } from '../constants'
import { detectLanguage } from '../core/detect'
import { dictionaryReady, isWordLike, lookupWord, sentenceAround } from '../core/dictionary'
import { languageName, normalizeLanguageTag, preferredLanguages } from '../core/languages'
import { requestSpeak, sendToBackground, type ContentRequest } from '../core/messages'
import { DEFAULT_SETTINGS, isSiteDisabled, loadSettings, onSettingsChanged, setTargetLanguage, type Settings } from '../core/settings'
import { translate, TranslateError } from '../core/translate'
import { writingAvailability } from '../core/writer'
import { copyToClipboard } from '../util/util'
import { PageTranslator } from './pageTranslate'
import { PopoverUI, type Anchor, type PopoverView } from './popover'
import { WritingTools } from './writing'

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
  /** The sentence the selection sits in, for word meanings. */
  context: string
}

const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

function init() {
  let settings: Settings = DEFAULT_SETTINGS
  let session: Session | null = null
  let seq = 0
  // Selecting text that's already in the target language normally shows nothing; explain it once per page.
  let sameLanguageHintShown = false

  // Writing tools only show up once the on-device model is ready; downloading it is the user's choice in Settings.
  let writerReady = false
  const refreshWriter = async () => {
    writerReady = settings.writingTools && (await writingAvailability('en')) === 'available'
  }

  loadSettings().then((s) => {
    settings = s
    refreshWriter()
  })
  onSettingsChanged((patch) => {
    settings = { ...settings, ...patch }
    if (!highlightActive() && session && !session.explicit) closeSession()
    if ('writingTools' in patch) refreshWriter()
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
  const writing = new WritingTools({ hints: () => hints(), badgeEnabled: () => writerReady && settings.writingBadge })

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
    if (s.explicit || ui.isOpen) render(s, { status: 'working', srcLang: s.srcLang, tgtLang: s.tgtLang, message: undefined, action: undefined, word: null })

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
      // A single word that's already in the target language still gets its meaning (a monolingual dictionary).
      let meaningOnly = false
      if (src === tgt) {
        // Bilingual pair: text already in the main target goes the other way.
        if (settings.pairLang && settings.pairLang !== src) tgt = settings.pairLang
        else if (settings.wordMeaning && isWordLike(s.text, src) && (await dictionaryReady(src))) meaningOnly = true
        else {
          const message = `This is already ${languageName(src)}. Choose a language above to translate it into.`
          if (s.explicit || ui.isOpen) return fail(s, message)
          if (sameLanguageHintShown) return closeSession()
          sameLanguageHintShown = true
          return render(s, { status: 'error', message, translated: '' })
        }
        if (!current()) return
      }

      if (!ui.isOpen) render(s, { status: 'working', srcLang: s.srcLang, tgtLang: tgt })
      const translated = meaningOnly
        ? s.text
        : await translate(s.text, src, tgt, {
            signal,
            onProgress: (progress) => current() && render(s, { status: 'downloading', progress }),
          })
      if (!current()) return
      render(s, { status: 'done', translated, tgtLang: tgt, srcLang: s.srcLang, word: null })

      // A single word also gets its meaning from the on-device model, under the translation.
      let meaning: { partOfSpeech?: string; definition?: string; example?: string } = {}
      const wordLike = settings.wordMeaning && isWordLike(s.text, src)
      const ready = wordLike && (await dictionaryReady(src))
      if (wordLike && !ready) console.debug('[translate-me] Word meaning skipped: on-device model not ready for', src)
      if (ready) {
        if (!current()) return
        render(s, { word: { status: 'loading' } })
        const info = await lookupWord(s.text, src, { context: s.context, signal }).catch((err) => {
          if ((err as Error)?.name !== 'AbortError') console.warn('[translate-me] Word meaning failed', err)
          return null
        })
        if (!info && current()) console.warn('[translate-me] Word meaning: the model gave no usable answer for', s.text)
        if (!current()) return
        if (info) {
          const sameLanguage = src.split('-')[0] === tgt.split('-')[0]
          const [translatedSense, translatedDefinition] = sameLanguage
            ? ['', '']
            : await Promise.all([info.sense, info.definition].map((t) => (t ? translate(t, src, tgt, { signal }).catch(() => '') : '')))
          if (!current()) return
          render(s, { word: { status: 'done', ...info, translatedSense, translatedDefinition } })
          const sense = translatedSense || info.sense
          meaning = {
            partOfSpeech: info.partOfSpeech,
            definition: `${sense ? `${sense}: ` : ''}${translatedDefinition ? `${translatedDefinition} (${info.definition})` : info.definition}`,
            example: info.example,
          }
        } else render(s, { word: null })
      }

      if (settings.saveHistory && alive()) {
        sendToBackground({ type: 'add-history', item: { text: s.text, translated, src, tgt, site: location.hostname, at: Date.now(), ...meaning } }).catch(() => {})
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

  function start(text: string, anchor: Anchor, options: { explicit: boolean; tgtLang?: string; context?: string }) {
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
      context: options.context ?? '',
      view: { srcLang: settings.srcLang, detected: null, tgtLang, status: 'working', progress: 0, translated: '', sourceText: clipped },
    }
    run(session)
  }

  /** The current selection as text + an anchor that tracks it while scrolling. */
  function readSelection(): { text: string; anchor: Anchor; context: string } | null {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && /^(text|search|url|email|)$/.test(active.type))) {
      const { selectionStart: a, selectionEnd: b } = active
      const text = a !== null && b !== null ? active.value.slice(a, b).trim() : ''
      if (!text) return null
      return { text, anchor: { rect: () => active.getBoundingClientRect() }, context: sentenceAround(active.value, text, active.value.indexOf(text, a ?? 0)) }
    }

    const sel = getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const text = sel.toString().trim()
    if (!text) return null
    const range = sel.getRangeAt(0).cloneRange()
    const container = range.commonAncestorContainer
    const block = (container instanceof Element ? container : container.parentElement)?.closest('p, li, td, th, dd, dt, blockquote, h1, h2, h3, h4, h5, h6, figcaption, div')
    return {
      context: block ? sentenceAround(block.textContent ?? '', text) : '',
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
      if (e.button !== 0 || ui.contains(e) || writing.contains(e) || !alive()) return
      // Let the browser finish updating the selection (double/triple click) first.
      setTimeout(() => {
        const inEditable = selectionInEditable()
        // Text the user is writing gets the writing tools button (proofread / rewrite).
        if (inEditable && writerReady && !writing.isOpen) writing.offer({ x: e.clientX, y: e.clientY })
        if (!highlightActive()) return
        const picked = readSelection()
        if (!picked || !/\p{L}/u.test(picked.text)) return
        if (settings.skipEditable && inEditable) return
        if (session && ui.isOpen && session.text === picked.text) return

        if (settings.triggerMode === 'auto') start(picked.text, picked.anchor, { explicit: false, context: picked.context })
        else if (settings.triggerMode === 'modifier') {
          if (e.altKey) start(picked.text, picked.anchor, { explicit: true, context: picked.context })
        } else {
          ui.showIcon({ x: e.clientX, y: e.clientY }, () => start(picked.text, picked.anchor, { explicit: true, context: picked.context }))
        }
      }, 10)
    },
    true
  )

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!writing.contains(e)) {
        writing.hideTrigger()
        if (writing.isOpen) writing.close()
      }
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
      if (writing.isTriggerVisible) writing.hideTrigger()
      writing.hideBadge()
      if (writing.isOpen) writing.close()
      if (ui.isIconVisible) ui.hideIcon()
      if (ui.isOpen) closeSession()
    },
    true
  )

  // Typing again makes the offered selection stale; the corner badge follows the text box.
  window.addEventListener(
    'input',
    (e) => {
      if (writing.contains(e)) return
      writing.hideTrigger()
      writing.watch()
    },
    true
  )
  document.addEventListener('focusin', (e) => !writing.contains(e) && writing.watch(e.composedPath()[0] ?? e.target), true)
  document.addEventListener('focusout', (e) => !writing.contains(e) && writing.unwatch(e.composedPath()[0] ?? e.target), true)

  const follow = () => {
    writing.hideTrigger()
    writing.reposition()
    writing.watch()
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
      if (picked) start(picked.text, picked.anchor, { explicit: true, tgtLang: msg.tgtLang, context: picked.context })
      return
    }
    if (msg.type === 'writing-tools') {
      // Context menu / shortcut: the selection, or the whole focused field if nothing is selected.
      if (msg.focusedOnly && !document.hasFocus()) return
      writing.openForFocusedField()
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
