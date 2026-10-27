import { detectLanguage } from '../core/detect'
import { diffWords, isUnchanged } from '../core/diff'
import { rewrite, WRITING_LANGUAGES, WRITING_MODES, WritingError, type WritingMode } from '../core/writer'
import { copyToClipboard } from '../util/util'
import { computeIconPosition, computePlacement, type Box } from './placement'
import { ICONS, POPOVER_CSS, WRITER_CSS } from './styles'

/** Where the text came from, so the suggestion can be put back in the same place. */
type Target =
  | { kind: 'field'; el: HTMLInputElement | HTMLTextAreaElement; start: number; end: number; text: string }
  | { kind: 'rich'; root: HTMLElement; range: Range; text: string }

const TEXT_INPUT = /^(text|search|url|email|)$/

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (html) node.innerHTML = html
  return node
}

const viewport = () => ({ width: document.documentElement.clientWidth || innerWidth, height: document.documentElement.clientHeight || innerHeight })

/** The outermost contenteditable element around `node`. */
function editableRoot(node: Node | null): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  let root: HTMLElement | null = null
  while (current?.isContentEditable) {
    root = current
    current = current.parentElement
  }
  return root
}

/**
 * Read the text the user is writing: the selection inside a text field or rich-text
 * editor, or (with `wholeIfEmpty`) everything in the focused field when nothing is selected.
 */
function captureTarget(wholeIfEmpty: boolean): Target | null {
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && TEXT_INPUT.test(active.type))) {
    let start = active.selectionStart ?? 0
    let end = active.selectionEnd ?? 0
    if (start === end && wholeIfEmpty) {
      start = 0
      end = active.value.length
    }
    const text = active.value.slice(start, end)
    return text.trim() ? { kind: 'field', el: active, start, end, text } : null
  }

  const sel = getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const root = editableRoot(sel.anchorNode)
  if (!root) return null
  let range = sel.getRangeAt(0).cloneRange()
  if (range.collapsed) {
    if (!wholeIfEmpty) return null
    range = document.createRange()
    range.selectNodeContents(root)
  }
  const text = range.toString()
  return text.trim() ? { kind: 'rich', root, range, text } : null
}

function targetRect(t: Target): Box | null {
  if (t.kind === 'field') return t.el.isConnected ? t.el.getBoundingClientRect() : null
  const r = t.range.getBoundingClientRect()
  return r.width || r.height ? r : null
}

/** Put `text` in place of the target, through the editor's own input path so undo and frameworks keep working. */
function applyToTarget(t: Target, text: string): boolean {
  if (t.kind === 'field') {
    const { el } = t
    if (!el.isConnected || el.value.slice(t.start, t.end) !== t.text) return false
    el.focus()
    el.setSelectionRange(t.start, t.end)
    if (!document.execCommand('insertText', false, text)) {
      el.setRangeText(text, t.start, t.end, 'end')
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }))
    }
    return true
  }

  const { root, range } = t
  if (!root.isConnected || range.toString() !== t.text) return false
  root.focus()
  const sel = getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  if (!document.execCommand('insertText', false, text)) {
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }))
  }
  return true
}

/**
 * Writing tools for text the user is typing: a ✍️ button next to a selection in a text
 * field or editor, and a card that proofreads it or rewrites it as Friendly,
 * Professional or Concise, with the changes highlighted and a Replace button.
 */
export class WritingTools {
  readonly host: HTMLElement
  private trigger: HTMLButtonElement
  private card: HTMLDivElement
  private tabs = new Map<WritingMode, HTMLButtonElement>()
  private body: HTMLDivElement
  private copyBtn: HTMLButtonElement
  private replaceBtn: HTMLButtonElement

  private target: Target | null = null
  private pending: Target | null = null
  private mode: WritingMode = 'proofread'
  private result = ''
  private controller: AbortController | null = null
  private hints: () => string[]

  constructor(options: { hints: () => string[] }) {
    this.hints = options.hints
    this.host = document.createElement('translate-me-writer')
    this.host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;'
    const root = this.host.attachShadow({ mode: 'closed' })
    const style = el('style')
    style.textContent = POPOVER_CSS + WRITER_CSS
    const wrap = el('div', { class: 'tm' })

    this.trigger = el('button', { class: 'icon-trigger', title: 'Improve writing', 'aria-label': 'Improve writing' }, ICONS.pen)
    this.trigger.hidden = true
    this.trigger.addEventListener('click', () => {
      const target = this.pending
      this.hideTrigger()
      if (target) this.open(target)
    })

    this.card = el('div', { class: 'card writer', role: 'dialog', 'aria-label': 'Writing tools' })
    this.card.hidden = true
    const head = el('div', { class: 'head' })
    const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Style' })
    for (const m of WRITING_MODES) {
      const tab = el('button', { role: 'tab', 'aria-selected': 'false' })
      tab.textContent = m.label
      tab.addEventListener('click', () => this.run(m.id))
      tabs.append(tab)
      this.tabs.set(m.id, tab)
    }
    const closeBtn = el('button', { title: 'Close (Esc)', 'aria-label': 'Close' }, ICONS.close)
    closeBtn.addEventListener('click', () => this.close())
    head.append(tabs, el('span', { class: 'spacer' }), closeBtn)

    this.body = el('div', { class: 'body diff', 'aria-live': 'polite' })

    const foot = el('div', { class: 'foot' })
    const hint = el('span', { class: 'hint' })
    hint.textContent = 'On-device AI · check before sending'
    this.copyBtn = el('button', { title: 'Copy suggestion', 'aria-label': 'Copy suggestion' }, ICONS.copy)
    this.copyBtn.addEventListener('click', async () => {
      if (!(await copyToClipboard(this.result))) return
      this.copyBtn.innerHTML = ICONS.check
      setTimeout(() => (this.copyBtn.innerHTML = ICONS.copy), 1200)
    })
    this.replaceBtn = el('button', { class: 'primary' })
    this.replaceBtn.textContent = 'Replace'
    this.replaceBtn.addEventListener('click', () => this.replace())
    foot.append(hint, el('span', { class: 'spacer' }), this.copyBtn, this.replaceBtn)

    this.card.append(head, this.body, foot)
    // Keep focus (and the visible selection) in the page's text field while using the buttons.
    for (const node of [this.trigger, this.card]) {
      node.addEventListener('mousedown', (e) => {
        if ((e.target as Element).closest('button')) e.preventDefault()
      })
    }
    wrap.append(this.trigger, this.card)
    root.append(style, wrap)
  }

  private mount() {
    if (!this.host.isConnected) document.documentElement.append(this.host)
  }

  contains(event: Event): boolean {
    return event.composedPath().includes(this.host)
  }

  get isOpen() {
    return !this.card.hidden
  }

  get isTriggerVisible() {
    return !this.trigger.hidden
  }

  /** Show the ✍️ button near `point` for the current selection in a text field. Returns false if there's nothing to offer. */
  offer(point: { x: number; y: number }): boolean {
    const target = captureTarget(false)
    if (!target) return false
    this.pending = target
    this.mount()
    const pos = computeIconPosition(point, 30, viewport())
    this.trigger.style.left = `${pos.left}px`
    this.trigger.style.top = `${pos.top}px`
    this.trigger.hidden = false
    return true
  }

  hideTrigger() {
    this.trigger.hidden = true
    this.pending = null
  }

  /** Open straight away (context menu, shortcut): the selection, or the whole field if nothing is selected. */
  openForFocusedField(): boolean {
    const target = captureTarget(true)
    if (!target) return false
    this.open(target)
    return true
  }

  private open(target: Target) {
    this.mount()
    this.target = target
    this.card.hidden = false
    this.run('proofread')
  }

  close() {
    this.controller?.abort()
    this.controller = null
    this.card.hidden = true
    this.target = null
    this.result = ''
  }

  private setStatus(message: string, warn = false) {
    const node = el('div', { class: warn ? 'status warn' : 'status' })
    node.textContent = message
    this.body.replaceChildren(node)
    this.result = ''
    this.copyBtn.disabled = true
    this.replaceBtn.disabled = true
    this.reposition()
  }

  private async run(mode: WritingMode) {
    const target = this.target
    if (!target) return
    this.mode = mode
    for (const [id, tab] of this.tabs) tab.setAttribute('aria-selected', String(id === mode))
    this.controller?.abort()
    const controller = (this.controller = new AbortController())
    const { signal } = controller
    this.setStatus(mode === 'proofread' ? 'Checking…' : 'Rewriting…')

    try {
      const detected = (await detectLanguage(target.text, { hints: this.hints(), signal })).language
      const lang = detected?.split('-')[0] ?? 'en'
      if (!WRITING_LANGUAGES.includes(lang)) {
        throw new WritingError('unsupported-language', 'Writing tools work with English, Japanese and Spanish for now.')
      }
      const result = await rewrite(target.text, mode, { lang, signal })
      if (signal.aborted || this.target !== target) return
      this.show(target.text, result)
    } catch (err) {
      if (signal.aborted || (err as Error)?.name === 'AbortError') return
      if (err instanceof WritingError) return this.setStatus(err.message, true)
      console.warn('[translate-me] Writing tools failed', err)
      this.setStatus('Something went wrong. Try again.', true)
    }
  }

  private show(before: string, after: string) {
    this.result = after
    this.body.replaceChildren()
    if (isUnchanged(before, after)) {
      const ok = el('div', { class: 'status' })
      ok.textContent = this.mode === 'proofread' ? 'Looks good: no changes needed.' : 'No changes suggested.'
      this.body.append(ok)
      this.copyBtn.disabled = true
      this.replaceBtn.disabled = true
    } else if (this.mode !== 'proofread') {
      // A rewrite changes most words; marking them all is noise, so show the new text as is.
      this.body.textContent = after
      this.copyBtn.disabled = false
      this.replaceBtn.disabled = false
    } else {
      for (const part of diffWords(before, after)) {
        if (part.type === 'same') this.body.append(document.createTextNode(part.text))
        else {
          const mark = document.createElement(part.type === 'added' ? 'ins' : 'del')
          mark.textContent = part.text
          this.body.append(mark)
        }
      }
      this.copyBtn.disabled = false
      this.replaceBtn.disabled = false
    }
    this.reposition()
  }

  private replace() {
    if (!this.target || !this.result) return
    if (applyToTarget(this.target, this.result)) this.close()
    else this.setStatus('The text changed since you selected it. Select it again and retry.', true)
  }

  reposition() {
    if (this.card.hidden || !this.target) return
    const box = targetRect(this.target)
    if (!box) return
    this.card.style.maxHeight = ''
    this.body.style.maxHeight = ''
    const size = { width: this.card.offsetWidth, height: this.card.offsetHeight }
    const chrome = size.height - this.body.offsetHeight
    const pos = computePlacement(box, size, viewport())
    this.card.style.left = `${pos.left}px`
    this.card.style.top = `${pos.top}px`
    this.card.style.maxHeight = `${pos.maxHeight}px`
    this.body.style.maxHeight = `${Math.max(40, pos.maxHeight - chrome)}px`
  }
}
