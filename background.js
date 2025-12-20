async function getBCP47() {
  const res = await fetch(chrome.runtime.getURL('bcp47.json'))
  return res.json()
}

async function createMenus() {
  const { tgtLang: lang } = await chrome.storage.sync.get({
    tgtLang: 'zh-HK',
  })
  const data = await getBCP47()
  const name = data.filter((b) => b.tag === lang).map((bb) => bb.lang)
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
  const { tgtLang: choice } = await chrome.storage.sync.get({
    tgtLang: 'zh-HK',
  })

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = `https://translate.google.com/translate?hl=auto&sl=auto&tl=${choice}&u=${encodeURIComponent(tab.url)}`
  chrome.tabs.create({ url })
})
