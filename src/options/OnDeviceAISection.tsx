import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '../core/settings'
import { prepareWritingModel, WRITING_MODES, writingAvailability } from '../core/writer'
import type { AIAvailability } from '../types/translator'
import { Row, Section, buttonClass } from './ui'

type Status = AIAvailability | 'checking'

/**
 * Chrome's built-in Gemini Nano powers the writing tools. Chrome only downloads it when
 * the user asks, so the download is a button here rather than something that happens
 * on its own the first time a text box is used.
 */
export default function OnDeviceAISection({
  settings,
  update,
  shortcut,
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  shortcut: (name: string) => ReactNode
}) {
  const [status, setStatus] = useState<Status>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => setStatus(await writingAvailability('en')), [])

  useEffect(() => {
    let alive = true
    writingAvailability('en').then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  // A download started elsewhere (or by Chrome itself) finishes in the background: check back now and then.
  useEffect(() => {
    if (status !== 'downloading' || progress !== null) return
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [status, progress, refresh])

  const download = async () => {
    setError('')
    setProgress(0)
    setStatus('downloading')
    try {
      await prepareWritingModel((f) => setProgress(f))
      setStatus('available')
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
      await refresh()
    } finally {
      setProgress(null)
    }
  }

  let state: ReactNode
  if (status === 'checking') state = <span className="text-zinc-400">Checking…</span>
  else if (status === 'unavailable') state = <span className="text-zinc-500">This computer can&apos;t run Chrome&apos;s on-device AI.</span>
  else if (status === 'available') state = <span className="text-emerald-700">Ready</span>
  else if (status === 'downloading')
    state = (
      <span className="flex items-center gap-2 text-zinc-600">
        Downloading{progress !== null ? `… ${Math.round(progress * 100)}%` : '…'}
        {progress !== null && (
          <span className="inline-block h-1.5 w-40 overflow-hidden rounded bg-zinc-200">
            <span className="block h-full bg-blue-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </span>
    )
  else
    state = (
      <>
        <span className="text-zinc-500">Not downloaded yet</span>
        <button type="button" className={buttonClass} onClick={download}>
          Download
        </button>
      </>
    )

  return (
    <Section
      title="Writing tools"
      description="Proofread what you type, or rewrite it to sound friendly, professional or concise. Runs on your device with Chrome's built-in AI; nothing is sent anywhere."
    >
      <Row label="Chrome's on-device AI" hint="Gemini Nano, built into Chrome">
        {state}
        {error && <span className="w-full text-xs text-amber-700">{error}</span>}
      </Row>
      <Row label="Writing tools">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={settings.writingTools} onChange={(e) => update({ writingTools: e.target.checked })} />
          Offer writing tools when I select text in a text box
        </label>
      </Row>
      <Row label="How to use" hint="English, Japanese and Spanish">
        <span className="w-full">
          Select text you&apos;ve typed and click ✍️, right-click a text box and choose <em>Improve writing</em>, or press {shortcut('improve-writing')}.
        </span>
        <span className="w-full text-zinc-500">{WRITING_MODES.map((m) => m.label).join(' · ')}</span>
      </Row>
    </Section>
  )
}
