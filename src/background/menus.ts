import { languageName } from '../core/languages'
import type { ContentRequest } from '../core/messages'
import { loadSettings, setTargetLanguage, type Settings } from '../core/settings'

const PAGE_BUILTIN = 'translate-page'
const PAGE_GOOGLE = 'translate-page-google'
const SELECTION_PARENT = 'translate-selection'
const SELECTION_PREFIX = 'translate-selection:'
const WRITING = 'improve-writing'

let rebuilding: Promise<void> = Promise.resolve()

/** Target languages offered in the "Translate selection to" submenu: current, pair, then recent. */
function selectionTargets(s: Settings): string[] {
  return [...new Set([s.tgtLang, s.pairLang, ...s.recentLangs].filter(Boolean))].slice(0, 6)
}

export function rebuildMenus(): Promise<void> {
  // Serialize: removeAll + create racing with another rebuild throws "duplicate id".
  rebuilding = rebuilding.catch(() => {}).then(async () => {
    const settings = await loadSettings()
    await chrome.contextMenus.removeAll()
    chrome.contextMenus.create({ id: PAGE_BUILTIN, title: `Translate page to ${languageName(settings.tgtLang)}`, contexts: ['page'] })
    chrome.contextMenus.create({ id: PAGE_GOOGLE, title: 'Open page in Google Translate', contexts: ['page'] })
    chrome.contextMenus.create({ id: SELECTION_PARENT, title: 'Translate selection to', contexts: ['selection'] })
    for (const lang of selectionTargets(settings)) {
      chrome.contextMenus.create({ id: SELECTION_PREFIX + lang, parentId: SELECTION_PARENT, title: languageName(lang), contexts: ['selection'] })
    }
    if (settings.writingTools) chrome.contextMenus.create({ id: WRITING, title: 'Improve writing', contexts: ['editable'] })
  })
  rebuilding.catch((err) => console.error('[translate-me] Failed to build context menus', err))
  return rebuilding
}

async function sendToTab(tabId: number, msg: ContentRequest, frameId?: number) {
  try {
    await chrome.tabs.sendMessage(tabId, msg, frameId !== undefined ? { frameId } : undefined)
  } catch {
    // No content script (chrome:// pages, the Web Store, PDFs, or a tab opened before install).
  }
}

export async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  if (!tab?.id) return
  const id = String(info.menuItemId)
  const settings = await loadSettings()

  if (id === PAGE_GOOGLE) {
    if (!tab.url) return
    const url = `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(settings.tgtLang)}&u=${encodeURIComponent(tab.url)}`
    await chrome.tabs.create({ url, index: tab.index + 1 })
    return
  }
  if (id === WRITING) {
    await sendToTab(tab.id, { type: 'writing-tools' }, info.frameId)
    return
  }
  if (id === PAGE_BUILTIN) {
    await sendToTab(tab.id, { type: 'translate-page', tgtLang: settings.tgtLang }, 0)
    return
  }
  if (id.startsWith(SELECTION_PREFIX)) {
    const lang = id.slice(SELECTION_PREFIX.length)
    await setTargetLanguage(lang)
    await sendToTab(tab.id, { type: 'translate-selection', tgtLang: lang }, info.frameId)
  }
}

/** Menus depend on these settings. */
export const MENU_KEYS: (keyof Settings)[] = ['tgtLang', 'pairLang', 'recentLangs', 'writingTools']
