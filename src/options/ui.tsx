import { useState, type ReactNode } from 'react'

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-sm text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,200px)_1fr] items-start gap-4 py-1">
      <label htmlFor={htmlFor} className="text-sm text-zinc-700 pt-1">
        {label}
        {hint && <span className="block text-xs text-zinc-400 font-normal">{hint}</span>}
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
    </div>
  )
}

export const inputClass = 'rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500'
export const buttonClass = 'rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-50 cursor-pointer disabled:opacity-40 disabled:cursor-default'

/**
 * Range input that updates instantly but only saves when the user lets go, keeping
 * chrome.storage.sync under its write-rate quota while dragging.
 */
export function Slider({
  id,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  const [synced, setSynced] = useState(value)
  // Adopt external changes (initial load, another tab) without an effect.
  if (value !== synced) {
    setSynced(value)
    setLocal(value)
  }
  const commit = () => local !== value && onCommit(local)
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => setLocal(parseFloat(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-56"
      />
      <span className="tabular-nums text-zinc-500 w-10">{local.toFixed(2)}</span>
    </>
  )
}

/** Text input that saves on blur / Enter rather than on every keystroke. */
export function LazyInput({
  id,
  value,
  onCommit,
  type = 'text',
  placeholder,
  className = '',
}: {
  id?: string
  value: string
  onCommit: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  const [local, setLocal] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setLocal(value)
  }
  return (
    <input
      id={id}
      type={type}
      value={local}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onCommit(local.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`${inputClass} ${className}`}
    />
  )
}
