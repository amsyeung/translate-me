import { useEffect, useState } from 'react'
import { diffWords, isUnchanged } from '../core/diff'
import { rewrite, WRITING_LANGUAGES, WRITING_MODES, writingAvailability, WritingError, type WritingMode } from '../core/writer'
import { copyToClipboard } from '../util/util'
import IconButton, { CopyIcon } from './IconButton'

type Result = { mode: WritingMode; status: 'working' } | { mode: WritingMode; status: 'done'; before: string; text: string } | { mode: WritingMode; status: 'error'; error: string }

/** Is the on-device model ready? Checked once per popup. */
function useWriterReady(enabled: boolean): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    writingAvailability('en').then((a) => alive && setReady(a === 'available'))
    return () => {
      alive = false
    }
  }, [enabled])
  return enabled && ready
}

/**
 * Proofread / rewrite the text typed in the popup, under the source box. "Use" puts the
 * suggestion back into the box (which also re-translates it); Copy takes it elsewhere.
 */
export default function WritingBar({ text, lang, enabled, onUse }: { text: string; lang: string | null; enabled: boolean; onUse: (text: string) => void }) {
  const ready = useWriterReady(enabled)
  const [result, setResult] = useState<Result | null>(null)
  const [forText, setForText] = useState(text)

  // A new text makes the previous suggestion stale.
  if (text !== forText) {
    setForText(text)
    setResult(null)
  }

  const primary = lang?.split('-')[0] ?? ''
  if (!ready || !text.trim() || !WRITING_LANGUAGES.includes(primary)) return null

  const run = async (mode: WritingMode) => {
    const source = text
    setResult({ mode, status: 'working' })
    try {
      const out = await rewrite(source, mode, { lang: primary })
      setResult((r) => (r?.mode === mode ? { mode, status: 'done', before: source, text: out } : r))
    } catch (err) {
      const error = err instanceof WritingError ? err.message : 'Something went wrong. Try again.'
      if (!(err instanceof WritingError)) console.warn('[translate-me] Writing tools failed', err)
      setResult((r) => (r?.mode === mode ? { mode, status: 'error', error } : r))
    }
  }

  const unchanged = result?.status === 'done' && isUnchanged(result.before, result.text)

  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Writing tools">
        <span className="text-[11px] text-zinc-400 mr-1">✍️</span>
        {WRITING_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => run(m.id)}
            aria-pressed={result?.mode === m.id}
            className={`rounded-full px-2.5 py-0.5 text-[11px] cursor-pointer border ${
              result?.mode === m.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {result && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2" aria-live="polite">
          {result.status === 'working' && <p className="text-xs text-zinc-500">{result.mode === 'proofread' ? 'Checking…' : 'Rewriting…'}</p>}
          {result.status === 'error' && <p className="text-xs text-amber-700">{result.error}</p>}
          {result.status === 'done' && unchanged && <p className="text-xs text-zinc-500">Looks good: no changes needed.</p>}
          {result.status === 'done' && !unchanged && (
            <>
              <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                {result.mode === 'proofread'
                  ? diffWords(result.before, result.text).map((part, i) =>
                      part.type === 'same' ? (
                        <span key={i}>{part.text}</span>
                      ) : part.type === 'added' ? (
                        <ins key={i} className="no-underline rounded-sm bg-green-100">
                          {part.text}
                        </ins>
                      ) : (
                        <del key={i} className="text-zinc-400 decoration-red-500">
                          {part.text}
                        </del>
                      )
                    )
                  : result.text}
              </p>
              <div className="mt-1 flex items-center justify-end gap-1">
                <span className="mr-auto text-[11px] text-zinc-400">On-device AI · check before sending</span>
                <IconButton label="Copy suggestion" onClick={() => copyToClipboard(result.text)}>
                  <CopyIcon />
                </IconButton>
                <button
                  type="button"
                  onClick={() => onUse(result.text)}
                  className="rounded-md bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                >
                  Use
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
