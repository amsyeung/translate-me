import { SORTED_LANGUAGES, languageName } from '../core/languages'
import { computeIconPosition, computePlacement, type Box } from './placement'
import { ICONS, POPOVER_CSS } from './styles'

/** Word meaning shown under the translation of a single word. */
export type WordView =
  | { status: 'loading' }
  | { status: 'done'; partOfSpeech: string; sense: string; translatedSense: string; definition: string; translatedDefinition: string; example: string }

export interface PopoverView {
  /** '' = auto-detect. */
  srcLang: string
  detected: string | null
  tgtLang: string
  status: 'working' | 'downloading' | 'done' | 'error'
  progress: number
  translated: string
  message?: string
  /** Label of a button shown under an error message (e.g. "Download model"). */
  action?: string
  /** Text for the "listen to original" button. */
  sourceText: string
  word?: WordView | null
}

export interface PopoverHandlers {
  onSourceChange(lang: string): void
  onTargetChange(lang: string): void
  onSpeak(which: 'source' | 'target'): void
  onCopy(): Promise<boolean>
  onClose(): void
  /** The error's action button was clicked (provides the user activation model downloads need). */
  onAction(): void
}

/** Something whose on-screen rectangle can be re-read (the selection Range follows scrolling). */
export interface Anchor {
  rect(): Box | null
  /** Horizontal point to centre the popover on. */
  centerX?: () => number | undefined
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (html) node.innerHTML = html
  return node
}

function languageOptions(select: HTMLSelectElement) {
  for (const l of SORTED_LANGUAGES) select.append(new Option(l.lang, l.tag))
}

const viewport = () => ({ width: document.documentElement.clientWidth || innerWidth, height: document.documentElement.clientHeight || innerHeight })

/**
 * The highlight-to-translate UI: a card next to the selection (plus the small trigger
 * button used in icon mode and the page-translation status pill), all inside one
 * closed shadow root so page styles can't break it.
 */
export class PopoverUI {
  readonly host: HTMLElement
  private root: ShadowRoot
  private card: HTMLDivElement
  private srcSelect: HTMLSelectElement
  private autoOption: HTMLOptionElement
  private tgtSelect: HTMLSelectElement
  private body: HTMLDivElement
  private pinBtn: HTMLButtonElement
  private copyBtn: HTMLButtonElement
  private speakSrcBtn: HTMLButtonElement
  private speakTgtBtn: HTMLButtonElement
  private hintEl: HTMLSpanElement
  private iconBtn: HTMLButtonElement
  private pill: HTMLDivElement
  private pillText: HTMLSpanElement
  private pillBtn: HTMLButtonElement

  private anchor: Anchor | null = null
  private dragged = false
  private pinned = false
  private hovering = false
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private autoHideMs = 0
  private onIconClick: (() => void) | null = null
  private onPillClick: (() => void) | null = null
  private view: PopoverView | null = null

  private handlers: PopoverHandlers

  constructor(handlers: PopoverHandlers) {
    this.handlers = handlers
    this.host = document.createElement('translate-me-overlay')
    this.host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;'
    this.root = this.host.attachShadow({ mode: 'closed' })

    const style = el('style')
    style.textContent = POPOVER_CSS
    const wrap = el('div', { class: 'tm' })

    // --- card
    this.card = el('div', { class: 'card', role: 'dialog', 'aria-label': 'Translation' })
    this.card.hidden = true

    const head = el('div', { class: 'head' })
    this.srcSelect = el('select', { 'aria-label': 'Source language' })
    this.autoOption = new Option('Auto', '')
    this.srcSelect.append(this.autoOption)
    languageOptions(this.srcSelect)
    this.tgtSelect = el('select', { 'aria-label': 'Target language' })
    languageOptions(this.tgtSelect)
    this.pinBtn = el('button', { title: 'Keep open', 'aria-label': 'Keep open', 'aria-pressed': 'false' }, ICONS.pin)
    const closeBtn = el('button', { title: 'Close (Esc)', 'aria-label': 'Close' }, ICONS.close)
    head.append(this.srcSelect, el('span', { class: 'arrow' }, '→'), this.tgtSelect, el('span', { class: 'spacer' }), this.pinBtn, closeBtn)

    this.body = el('div', { class: 'body', 'aria-live': 'polite' })

    const foot = el('div', { class: 'foot' })
    this.speakSrcBtn = el('button', { title: 'Listen to original', 'aria-label': 'Listen to original' }, `${ICONS.speaker}<span>Original</span>`)
    this.speakTgtBtn = el('button', { title: 'Listen to translation', 'aria-label': 'Listen to translation' }, ICONS.speaker)
    this.copyBtn = el('button', { title: 'Copy translation', 'aria-label': 'Copy translation' }, ICONS.copy)
    this.hintEl = el('span', { class: 'hint' })
    foot.append(this.speakSrcBtn, el('span', { class: 'spacer' }), this.hintEl, this.speakTgtBtn, this.copyBtn)

    this.card.append(head, this.body, foot)

    // --- icon-mode trigger
    this.iconBtn = el('button', { class: 'icon-trigger', title: 'Translate selection', 'aria-label': 'Translate selection' }, ICONS.translate)
    this.iconBtn.hidden = true
    this.iconBtn.addEventListener('click', () => {
      const onClick = this.onIconClick
      this.hideIcon()
      onClick?.()
    })

    // --- page translation pill
    this.pill = el('div', { class: 'pill', role: 'status' })
    this.pill.hidden = true
    this.pillText = el('span')
    this.pillBtn = el('button')
    this.pillBtn.addEventListener('click', () => this.onPillClick?.())
    this.pill.append(this.pillText, this.pillBtn)

    wrap.append(this.card, this.iconBtn, this.pill)
    this.root.append(style, wrap)

    // --- behaviour
    this.srcSelect.addEventListener('change', () => this.handlers.onSourceChange(this.srcSelect.value))
    this.tgtSelect.addEventListener('change', () => this.handlers.onTargetChange(this.tgtSelect.value))
    closeBtn.addEventListener('click', () => this.handlers.onClose())
    this.pinBtn.addEventListener('click', () => this.setPinned(!this.pinned))
    this.speakSrcBtn.addEventListener('click', () => this.handlers.onSpeak('source'))
    this.speakTgtBtn.addEventListener('click', () => this.handlers.onSpeak('target'))
    this.copyBtn.addEventListener('click', async () => {
      if (!(await this.handlers.onCopy())) return
      this.copyBtn.innerHTML = ICONS.check
      setTimeout(() => (this.copyBtn.innerHTML = ICONS.copy), 1200)
    })
    this.card.addEventListener('mouseenter', () => {
      this.hovering = true
      this.clearHideTimer()
    })
    this.card.addEventListener('mouseleave', () => {
      this.hovering = false
      this.armHideTimer()
    })
    this.enableDrag(head)
  }

  private mount() {
    if (!this.host.isConnected) document.documentElement.append(this.host)
  }

  /** True if the event happened inside our UI (works through the closed shadow root). */
  contains(event: Event): boolean {
    return event.composedPath().includes(this.host)
  }

  get isOpen() {
    return !this.card.hidden
  }

  get isSticky() {
    return this.pinned || this.dragged
  }

  // ---------------------------------------------------------------- card

  open(anchor: Anchor, view: PopoverView, autoHideSeconds: number) {
    this.mount()
    this.hideIcon()
    this.anchor = anchor
    this.autoHideMs = Math.max(0, autoHideSeconds) * 1000
    this.update(view)
    this.card.hidden = false
    this.reposition()
    this.armHideTimer()
  }

  update(view: PopoverView) {
    this.view = view
    this.autoOption.textContent = view.detected ? `Auto · ${languageName(view.detected)}` : 'Auto · ?'
    this.srcSelect.value = view.srcLang
    this.tgtSelect.value = view.tgtLang

    this.body.replaceChildren()
    this.body.classList.toggle('dim', view.status === 'working' && Boolean(view.translated))
    if (view.translated && view.status !== 'error') {
      this.body.append(document.createTextNode(view.translated))
      if (view.word) this.body.append(this.renderWord(view.word))
    } else if (view.status === 'downloading') {
      const p = Math.round(view.progress * 100)
      this.body.append(el('div', { class: 'status' }, `Downloading ${languageName(view.srcLang || view.detected)} → ${languageName(view.tgtLang)} model… ${p}%`))
      const bar = el('div', { class: 'bar' }, '<i></i>')
      ;(bar.firstChild as HTMLElement).style.width = `${p}%`
      this.body.append(bar)
    } else if (view.status === 'error') {
      const msg = el('div', { class: 'status warn' })
      msg.textContent = view.message ?? 'Translation failed.'
      this.body.append(msg)
      if (view.action) {
        const btn = el('button', { class: 'action' })
        btn.textContent = view.action
        btn.addEventListener('click', () => this.handlers.onAction())
        this.body.append(btn)
      }
    } else {
      this.body.append(el('div', { class: 'status' }, 'Translating…'))
    }

    const hasText = Boolean(view.translated) && view.status !== 'error'
    this.copyBtn.disabled = !hasText
    this.speakTgtBtn.disabled = !hasText
    this.speakSrcBtn.disabled = !(view.srcLang || view.detected)
    this.hintEl.textContent = view.status === 'done' ? 'Esc to close' : ''
    if (!this.card.hidden) this.reposition()
  }

  /** Part of speech, the meaning (in the target language, with the original underneath) and an example. */
  private renderWord(word: WordView): HTMLElement {
    const box = el('div', { class: 'dict' })
    if (word.status === 'loading') {
      box.append(el('div', { class: 'status' }, 'Looking up the meaning…'))
      return box
    }
    const line = el('div')
    if (word.partOfSpeech) {
      const pos = el('span', { class: 'pos' })
      pos.textContent = word.partOfSpeech
      line.append(pos)
    }
    // The meaning in this sentence ("河岸" for bank by a river), then the definition.
    const sense = word.translatedSense || word.sense
    if (sense) {
      const strong = el('strong', { class: 'sense' })
      strong.textContent = sense
      line.append(strong, document.createTextNode(' — '))
    }
    line.append(document.createTextNode(word.translatedDefinition || word.definition))
    box.append(line)
    if (word.translatedDefinition && word.translatedDefinition !== word.definition) {
      const original = el('div', { class: 'def-src' })
      original.textContent = word.definition
      box.append(original)
    }
    if (word.example) {
      const example = el('div', { class: 'example' })
      example.textContent = word.example
      box.append(example)
    }
    return box
  }

  close() {
    this.clearHideTimer()
    this.card.hidden = true
    this.anchor = null
    this.dragged = false
    this.setPinned(false)
    this.view = null
  }

  get currentView() {
    return this.view
  }

  setPinned(pinned: boolean) {
    this.pinned = pinned
    this.pinBtn.setAttribute('aria-pressed', String(pinned))
    this.pinBtn.title = pinned ? 'Unpin' : 'Keep open'
    if (pinned) this.clearHideTimer()
    else this.armHideTimer()
  }

  /** Follow the anchor (on scroll/resize). Returns false if the anchor has left the viewport. */
  reposition(): boolean {
    if (this.card.hidden || !this.anchor) return true
    const box = this.anchor.rect()
    const vp = viewport()
    const visible = !box || (box.bottom > 0 && box.top < vp.height && box.right > 0 && box.left < vp.width)
    if (this.dragged || !box) return visible

    // Measure at natural height so we can tell whether it fits.
    this.card.style.maxHeight = ''
    this.body.style.maxHeight = ''
    const size = { width: this.card.offsetWidth, height: this.card.offsetHeight }
    const chrome = size.height - this.body.offsetHeight
    const pos = computePlacement(box, size, vp, { centerX: this.anchor.centerX?.() })
    this.card.style.left = `${pos.left}px`
    this.card.style.top = `${pos.top}px`
    this.card.style.maxHeight = `${pos.maxHeight}px`
    // Only the text scrolls; the language bar and buttons stay visible.
    this.body.style.maxHeight = `${Math.max(40, pos.maxHeight - chrome)}px`
    return visible
  }

  /** Called on scroll/resize (already frame-aligned by the browser). */
  follow(onAnchorGone: () => void) {
    if (!this.reposition() && !this.isSticky) onAnchorGone()
  }

  private armHideTimer() {
    this.clearHideTimer()
    if (!this.autoHideMs || this.isSticky || this.hovering || this.card.hidden) return
    this.hideTimer = setTimeout(() => this.handlers.onClose(), this.autoHideMs)
  }

  private clearHideTimer() {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private enableDrag(handle: HTMLElement) {
    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0
    let dragging = false

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('select, button')) return
      dragging = true
      startX = e.clientX
      startY = e.clientY
      originLeft = this.card.offsetLeft
      originTop = this.card.offsetTop
      handle.setPointerCapture(e.pointerId)
      e.preventDefault()
    })
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const vp = viewport()
      const left = Math.min(Math.max(originLeft + e.clientX - startX, 0), vp.width - this.card.offsetWidth)
      const top = Math.min(Math.max(originTop + e.clientY - startY, 0), vp.height - 40)
      this.card.style.left = `${left}px`
      this.card.style.top = `${top}px`
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 3) {
        this.dragged = true
        this.clearHideTimer()
      }
    })
    const end = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId)
    }
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  // ---------------------------------------------------------------- icon trigger

  showIcon(point: { x: number; y: number }, onClick: () => void) {
    this.mount()
    this.onIconClick = onClick
    const pos = computeIconPosition(point, 30, viewport())
    this.iconBtn.style.left = `${pos.left}px`
    this.iconBtn.style.top = `${pos.top}px`
    this.iconBtn.hidden = false
  }

  hideIcon() {
    this.iconBtn.hidden = true
    this.onIconClick = null
  }

  get isIconVisible() {
    return !this.iconBtn.hidden
  }

  // ---------------------------------------------------------------- page translation pill

  showPill(text: string, button: string, onClick: () => void) {
    this.mount()
    this.pillText.textContent = text
    this.pillBtn.textContent = button
    this.onPillClick = onClick
    this.pill.hidden = false
  }

  hidePill() {
    this.pill.hidden = true
    this.onPillClick = null
  }
}
