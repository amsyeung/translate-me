import type { Monitor, TranslatorStatic } from './types/translator'
import { DEFAULT_TARGET_LANG } from './constants'

declare const Translator: TranslatorStatic

const TOP_THRESHOLD = 30 // px from the top of the viewport
const BOTTOM_OFFSET = 20 // px below the selection when we flip
const SIDE_MARGIN = 8 // px margin on left/right edges

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

function getToastPosition(rect: DOMRect) {
  let top: number, left: number

  if (rect.top < TOP_THRESHOLD) {
    /* Too close to the top → show *below* */
    top = rect.bottom + BOTTOM_OFFSET
    left = rect.left + rect.width / 2
  } else {
    /* Normal case – above the selection */
    top = rect.top - 70
    left = rect.left + rect.width / 2
  }

  // Horizontal clamp so it never overflows the viewport
  left = clamp(left, SIDE_MARGIN, innerWidth - SIDE_MARGIN)

  return { top, left }
}

// Tracks the pending fade/remove timer so a newer toast can cancel a stale one
// instead of leaving an orphaned timer + transitionend listener behind.
let hideTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, rect: DOMRect) {
  document.querySelectorAll('#pageToast').forEach((el) => el.remove())
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  const toast = document.createElement('div')
  toast.id = 'pageToast'
  toast.textContent = text

  const { top, left } = getToastPosition(rect)

  Object.assign(toast.style, {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    transform: 'translateX(-40%)',
    background: '#323232',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    boxShadow: '0 2px 6px rgba(0,0,0,.3)',
    opacity: '0',
    transition: 'opacity .25s ease',
    zIndex: '2147483647',
    maxWidth: '80ch',
  })

  toast.addEventListener('click', (e) => {
    e.stopPropagation()
    copyToClipboard(text)
  })

  document.body.appendChild(toast)

  requestAnimationFrame(() => (toast.style.opacity = '1'))

  hideTimer = setTimeout(() => {
    toast.style.opacity = '0'
    toast.addEventListener('transitionend', () => toast.remove())
    hideTimer = null
  }, 5000)
}

/**
 * Returns true if the string contains at least one "meaningful" character
 * (letters, digits, or any non-punctuation symbol).
 */
function shouldShow(text: string): boolean {
  // Empty → false
  if (!text.trim()) return false

  // Only punctuation / whitespace → false
  return /[^\p{P}\p{S}\s]/u.test(text)
}

async function onSelectionChange(e: MouseEvent) {
  if (e.target instanceof Element && e.target.closest('#pageToast')) return

  const sel = window.getSelection()
  if (!sel?.toString().trim()) return
  const rect = sel.getRangeAt(0).getBoundingClientRect()

  if (!chrome.storage) return

  const { srcLang, tgtLang } = (await chrome.storage.sync.get({
    srcLang: 'en',
    tgtLang: DEFAULT_TARGET_LANG,
  })) as { srcLang: string; tgtLang: string }

  try {
    const availability = await Translator.availability({
      sourceLanguage: srcLang,
      targetLanguage: tgtLang,
    })
    let translator
    if (availability === 'downloadable') {
      translator = await Translator.create({
        sourceLanguage: srcLang,
        targetLanguage: tgtLang,
        monitor(m: Monitor) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`Download ${e.loaded * 100}%`)
          })
        },
      })
    } else if (availability === 'unavailable') {
      return
    } else {
      translator = await Translator.create({
        sourceLanguage: srcLang,
        targetLanguage: tgtLang,
      })
    }
    const translation = await translator.translate(sel.toString())
    if (shouldShow(translation)) {
      showToast(translation, rect)
    }
  } catch (err) {
    console.error('Translation error', err)
  }
}

// hide toast when user clicks elsewhere
document.addEventListener('click', () => {
  document.querySelectorAll('#pageToast').forEach((el) => el.remove())
})

document.addEventListener('mouseup', onSelectionChange)
