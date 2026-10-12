import type { OffscreenRequest } from '../../core/messages'
import type { Audio } from './cloud'

const OFFSCREEN_URL = 'offscreen.html'
let creating: Promise<void> | null = null

/** Service workers can't play audio; an offscreen document does it for them. */
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (existing.length) return
  creating ??= chrome.offscreen
    .createDocument({ url: OFFSCREEN_URL, reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK], justification: 'Play text-to-speech audio' })
    .finally(() => (creating = null))
  await creating
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function playAudio(audio: Audio, volume: number) {
  await ensureOffscreen()
  const msg: OffscreenRequest = { target: 'offscreen', type: 'play', audio: toBase64(audio.data), mime: audio.mime, volume }
  const res = (await chrome.runtime.sendMessage(msg)) as { ok: boolean; error?: string } | undefined
  if (!res?.ok) throw new Error(res?.error ?? 'Audio playback failed')
}

export async function stopAudio() {
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
  if (!existing.length) return
  const msg: OffscreenRequest = { target: 'offscreen', type: 'stop' }
  await chrome.runtime.sendMessage(msg).catch(() => {})
}
