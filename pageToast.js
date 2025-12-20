const TOP_THRESHOLD   = 30;   // px from the top of the viewport
const BOTTOM_OFFSET  = 20;   // px below the selection when we flip
const SIDE_MARGIN    = 8;    // px margin on left/right edges

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

function getToastPosition(rect) {
  let top, left

  if (rect.top < TOP_THRESHOLD) {
    /* Too close to the top → show *below* */
    top  = rect.bottom + BOTTOM_OFFSET
    left = rect.left + rect.width / 2
  } else {
    /* Normal case – above the selection */
    top  = rect.top - 70
    left = rect.left + rect.width / 2
  }

  // Horizontal clamp so it never overflows the viewport
  left = clamp(left, SIDE_MARGIN, innerWidth - SIDE_MARGIN)

  return { top, left }
}

function showToast(text, rect) {
  document.querySelectorAll('#pageToast').forEach((el) => el.remove())
  const container = document.createElement('div')
  const toast = document.createElement('div')
  toast.id = 'pageToast'
  toast.textContent = text

  const { top, left } = getToastPosition(rect)

  Object.assign(container.style, {
    display: 'flex'
  })

  Object.assign(toast.style, {
    position:   'fixed',
    top:        `${top}px`,
    left:       `${left}px`,
    transform:  'translateX(-40%)',
    background: '#323232',
    color:      '#fff',
    padding:    '8px 12px',
    borderRadius: '4px',
    fontSize:   '14px',
    boxShadow:  '0 2px 6px rgba(0,0,0,.3)',
    opacity:    '0',
    transition:'opacity .25s ease',
    zIndex:     2147483647,
    maxWidth:   '80ch'
  })


  toast.addEventListener('click', e => {
    e.stopPropagation()
    copyToClipboard(text)
  })

  document.body.appendChild(toast)
 
  requestAnimationFrame(() => (toast.style.opacity = '1'))

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.addEventListener('transitionend', () => toast.remove())
  }, 5000)
}

/**
 * Returns true if the string contains at least one “meaningful” character
 * (letters, digits, or any non‑punctuation symbol).
 */
function shouldShow(text) {
  // Empty → false
  if (!text.trim()) return false

  // Only punctuation / whitespace → false
  const hasMeaning = /[^\p{P}\p{S}\s]/u.test(text)
  // If you want to allow numbers/letters but reject only symbols:
  // const hasMeaning = /[A-Za-z0-9]/.test(text)

  return !!hasMeaning
}

async function onSelectionChange(e) {

  if (e.target instanceof Element && e.target.closest('#pageToast')) return

  const sel = window.getSelection()
  if (!sel?.toString().trim()) return
  const rect = sel.getRangeAt(0).getBoundingClientRect()

  if (!chrome.storage) return

  const { srcLang, tgtLang } = await chrome.storage.sync.get({
    srcLang: 'en',
    tgtLang: 'zh',
  })

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
        monitor(m) {
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
  } catch (e) {
    console.error('Translation error', e)
  }
}

// hide toast when user clicks elsewhere
document.addEventListener('click', () => {
  document.querySelectorAll('#pageToast').forEach(el => el.remove());
});

document.addEventListener('mouseup', onSelectionChange)

