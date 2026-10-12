import type { OffscreenRequest } from './core/messages'

// Plays cloud TTS audio on behalf of the service worker.
const audio = new Audio()
let objectUrl: string | null = null

chrome.runtime.onMessage.addListener((msg: OffscreenRequest, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return

  audio.pause()
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null

  if (msg.type === 'play') {
    const bytes = Uint8Array.from(atob(msg.audio), (c) => c.charCodeAt(0))
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: msg.mime }))
    audio.src = objectUrl
    audio.volume = Math.min(1, Math.max(0, msg.volume))
    audio
      .play()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }
  sendResponse({ ok: true })
})
