import bcp47 from './util/bcp47.json'
import type { Bcp47Item } from './types/speech'
import { DEFAULT_TARGET_LANG } from './constants'

async function createMenus() {
  const { tgtLang: lang } = await chrome.storage.sync.get({ tgtLang: DEFAULT_TARGET_LANG })
  const name = (bcp47 as Bcp47Item[]).find((b) => b.tag === lang)?.lang ?? lang

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: `translate-page-${lang}`,
      title: `Translate to ${name}`,
      contexts: ['page'],
    })
  })
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log(
    '%c🗾 Welcome! Sponsor☕ http://buymeacoffee.com/amsy',
    'padding: .5rem .6rem;background-color: black; color: white; border-radius: 5px; border: 1px solid #1f1f1f;'
  )
  await createMenus()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return

  // If *tgtLang* changed → rebuild the context menu
  if ('tgtLang' in changes) createMenus()
})

chrome.contextMenus.onClicked.addListener(async () => {
  const { tgtLang: choice } = await chrome.storage.sync.get({ tgtLang: DEFAULT_TARGET_LANG })

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return

  const url = `https://translate.google.com/translate?hl=auto&sl=auto&tl=${choice}&u=${encodeURIComponent(tab.url)}`
  chrome.tabs.create({ url })
})
