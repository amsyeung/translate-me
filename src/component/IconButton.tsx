import type { ReactNode } from 'react'

export default function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 active:scale-110 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
    >
      {children}
    </button>
  )
}

export function CopyIcon() {
  return <img src="/copy.png" width={15} height={15} alt="" />
}

export function SpeakerIcon() {
  return <img src="/speaker.png" width={15} height={15} alt="" />
}
