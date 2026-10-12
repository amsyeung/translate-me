import { detectLanguage, prepareDetector } from '../core/detect'
import { languageName, normalizeLanguageTag } from '../core/languages'
import { pairAvailability, prepareTranslator, translate, TranslateError } from '../core/translate'
import type { PopoverUI } from './popover'

// Elements whose text is translated as one unit.
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, figcaption, td, th, summary, caption'
// Never touch these (or anything inside them).
const SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'textarea',
  'input',
  'select',
  'code',
  'pre',
  'kbd',
  'samp',
  'svg',
  'math',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[translate="no"]',
  '.notranslate',
  'translate-me-overlay',
  '[data-translate-me]',
].join(', ')

const DONE_ATTR = 'data-translate-me-done'
const OUTPUT_ATTR = 'data-translate-me'
const MAX_BLOCK_CHARS = 4000

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && /\p{L}/u.test(node.textContent ?? '')) return true
  }
  return false
}

function isCandidate(el: Element): boolean {
  return el.matches(BLOCK_SELECTOR) || (el.tagName === 'DIV' && hasOwnText(el))
}

/** Innermost text blocks under `root` that haven't been translated yet. */
function collectBlocks(root: Element): Element[] {
  const all = [root, ...root.querySelectorAll(`${BLOCK_SELECTOR}, div`)].filter(isCandidate)
  // Every ancestor of a candidate is a container whose text belongs to a more specific
  // block inside it. Walking up once per candidate keeps this linear on large pages.
  const containers = new Set<Element>()
  for (const el of all) {
    for (let p = el.parentElement; p && !containers.has(p); p = p.parentElement) containers.add(p)
  }
  return all.filter((el) => {
    if (containers.has(el) || el.hasAttribute(DONE_ATTR) || el.closest(SKIP_SELECTOR)) return false
    const text = (el.textContent ?? '').trim()
    return text.length >= 2 && /\p{L}/u.test(text)
  })
}

/**
 * Bilingual whole-page translation with Chrome's on-device model: each paragraph gets
 * its translation inserted underneath. Blocks are translated lazily as they scroll
 * near the viewport, and content added later (infinite scroll, SPAs) is picked up.
 */
export class PageTranslator {
  private active = false
  private tgtLang = ''
  private queue: Element[] = []
  private working = false
  private done = 0
  private controller: AbortController | null = null
  private intersection: IntersectionObserver | null = null
  private mutation: MutationObserver | null = null
  private mutationTimer: ReturnType<typeof setTimeout> | null = null

  private ui: PopoverUI

  constructor(ui: PopoverUI) {
    this.ui = ui
  }

  get isActive() {
    return this.active
  }

  private hints(): string[] {
    const page = normalizeLanguageTag(document.documentElement.lang)
    return page ? [page] : []
  }

  /**
   * Check the page's main language pair first. A model that still has to be downloaded
   * needs a click *in the page* (the context menu doesn't count as user activation),
   * so in that case we ask for one via the pill button before translating anything.
   */
  async start(tgtLang: string) {
    this.stop()
    this.active = true
    this.tgtLang = tgtLang
    this.done = 0
    this.working = false
    const controller = (this.controller = new AbortController())
    const live = () => this.active && this.controller === controller

    this.ui.showPill(`Preparing ${languageName(tgtLang)} translation…`, 'Cancel', () => this.stop())

    let source: string | null = null
    let needsDownload = false
    try {
      const sample = (document.body.innerText ?? '').slice(0, 3000)
      source = (await detectLanguage(sample, { hints: this.hints(), signal: controller.signal })).language
      if (source && source !== tgtLang) {
        const availability = await pairAvailability(source, tgtLang)
        if (availability === 'unavailable') {
          if (live()) this.ui.showPill(`Chrome can't translate ${languageName(source)} → ${languageName(tgtLang)} on this device`, 'Close', () => this.stop())
          return
        }
        needsDownload = availability !== 'available'
      }
    } catch (err) {
      if (!live()) return
      if (err instanceof TranslateError && err.code === 'needs-activation') needsDownload = true
    }
    if (!live()) return

    if (!needsDownload) return this.begin()

    const pair = source ? `${languageName(source)} → ${languageName(tgtLang)}` : languageName(tgtLang)
    this.ui.showPill(`The ${pair} model needs a one-time download`, 'Download & translate', async () => {
      try {
        await prepareDetector()
        if (source && source !== tgtLang) {
          await prepareTranslator(source, tgtLang, (p) => {
            if (live()) this.ui.showPill(`Downloading ${pair} model… ${Math.round(p * 100)}%`, 'Cancel', () => this.stop())
          })
        }
        if (live()) this.begin()
      } catch {
        if (live()) this.ui.showPill(`Couldn't download the ${pair} model`, 'Close', () => this.stop())
      }
    })
  }

  private begin() {
    this.intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          this.intersection?.unobserve(entry.target)
          this.queue.push(entry.target)
        }
        this.pump()
      },
      { rootMargin: '800px 0px' }
    )
    this.observe(document.body)

    this.mutation = new MutationObserver((records) => {
      if (records.every((r) => [...r.addedNodes].every((n) => n instanceof Element && n.hasAttribute(OUTPUT_ATTR)))) return
      if (this.mutationTimer) clearTimeout(this.mutationTimer)
      this.mutationTimer = setTimeout(() => this.observe(document.body), 600)
    })
    this.mutation.observe(document.body, { childList: true, subtree: true })
    this.updatePill()
  }

  stop() {
    if (!this.active) return
    this.active = false
    this.working = false
    this.controller?.abort()
    this.controller = null
    this.intersection?.disconnect()
    this.mutation?.disconnect()
    this.intersection = null
    this.mutation = null
    if (this.mutationTimer) clearTimeout(this.mutationTimer)
    this.queue = []
    document.querySelectorAll(`[${OUTPUT_ATTR}]`).forEach((n) => n.remove())
    document.querySelectorAll(`[${DONE_ATTR}]`).forEach((n) => n.removeAttribute(DONE_ATTR))
    this.ui.hidePill()
  }

  private observe(root: Element) {
    for (const el of collectBlocks(root)) {
      el.setAttribute(DONE_ATTR, '')
      this.intersection?.observe(el)
    }
  }

  private updatePill(error?: string) {
    if (!this.active) return
    const text = error ?? (this.working ? `Translating to ${languageName(this.tgtLang)}… ${this.done}` : `Translated to ${languageName(this.tgtLang)}`)
    this.ui.showPill(text, 'Show original', () => this.stop())
  }

  private async pump() {
    if (this.working || !this.active || !this.controller) return
    const controller = this.controller
    const { signal } = controller
    // stop() (or a restart) swaps the controller; the old loop must then exit without touching state.
    const live = () => this.active && this.controller === controller
    this.working = true
    const hints = this.hints()
    let error: string | undefined

    try {
      while (this.queue.length && live()) {
        const el = this.queue.shift()!
        if (!el.isConnected) continue
        const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().slice(0, MAX_BLOCK_CHARS)
        try {
          const { language } = await detectLanguage(text, { hints, signal })
          if (!language || language === this.tgtLang) continue
          const translated = await translate(text, language, this.tgtLang, { signal })
          if (!live()) return
          const out = document.createElement('span')
          out.setAttribute(OUTPUT_ATTR, '')
          out.setAttribute('translate', 'no')
          out.lang = this.tgtLang
          out.style.cssText =
            'display:block;margin:.35em 0 0;padding-left:.6em;border-left:2px solid rgba(37,99,235,.35);opacity:.9;font-size:.95em;white-space:pre-wrap;'
          out.textContent = translated
          el.append(out)
          this.done++
          this.updatePill()
        } catch (err) {
          if (!live()) return
          if (err instanceof TranslateError && err.code === 'api-unavailable') {
            error = "Chrome's built-in translator isn't available on this page"
            return
          }
          // Unsupported pair, a model this block's language still needs, an odd block: skip it.
        }
      }
    } finally {
      if (live()) {
        this.working = false
        this.updatePill(error)
      }
    }
  }
}
