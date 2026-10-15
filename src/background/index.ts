import type { BackgroundRequest, ContentRequest } from '../core/messages'
import { addHistory } from '../core/history'
import { loadSettings, onSettingsChanged, saveSettings } from '../core/settings'
import { handleMenuClick, MENU_KEYS, rebuildMenus } from './menus'
import { listAzureVoices, listElevenVoices } from './tts/cloud'
import { speak, stopSpeaking } from './tts'
import { listSharedVoices } from './tts/shared'

let historyQueue: Promise<void> = Promise.resolve()

async function updateBadge() {
  const { highlightEnabled } = await loadSettings()
  await chrome.action.setBadgeBackgroundColor({ color: '#71717a' })
  await chrome.action.setBadgeText({ text: highlightEnabled ? '' : 'off' })
}

chrome.runtime.onInstalled.addListener(() => {
  console.log(
    '%c🗾 Welcome! Sponsor☕ http://buymeacoffee.com/amsy',
    'padding: .5rem .6rem;background-color: black; color: white; border-radius: 5px; border: 1px solid #1f1f1f;'
  )
  rebuildMenus()
  updateBadge()
})
chrome.runtime.onStartup.addListener(() => updateBadge())

onSettingsChanged((patch) => {
  if (MENU_KEYS.some((k) => k in patch)) rebuildMenus()
  if ('highlightEnabled' in patch) updateBadge()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab)
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-highlight') {
    const { highlightEnabled } = await loadSettings()
    await saveSettings({ highlightEnabled: !highlightEnabled })
    return
  }
  if (command === 'translate-selection' && tab?.id) {
    const msg: ContentRequest = { type: 'translate-selection', focusedOnly: true }
    // Every frame gets it; only the one holding a selection responds.
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {})
  }
})

chrome.runtime.onMessage.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
  switch (msg?.type) {
    case 'speak':
      speak(msg.text, msg.lang).then(sendResponse)
      return true
    case 'stop-speaking':
      stopSpeaking().then(() => sendResponse({ ok: true }))
      return true
    case 'list-cloud-voices':
      ;(msg.provider === 'shared'
        ? listSharedVoices(msg.lang ?? 'en')
        : msg.provider === 'azure'
          ? loadSettings().then((s) => listAzureVoices(s.azureRegion))
          : listElevenVoices()
      )
        .then((voices) => sendResponse({ ok: true, voices }))
        .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }))
      return true
    case 'add-history':
      // Serialized here so translations from several tabs/frames don't overwrite each other.
      historyQueue = historyQueue.then(() => addHistory(msg.item)).catch(() => {})
      return
    case 'open-options':
      chrome.runtime.openOptionsPage()
      return
  }
})
