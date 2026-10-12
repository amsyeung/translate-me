import { SORTED_LANGUAGES } from '../core/languages'

type Props = {
  value: string
  onChange: (lang: string) => void
  /** When set, adds an "auto-detect" option (value '') with this label. */
  autoLabel?: string
  label: string
  className?: string
}

export default function LanguageSelect({ value, onChange, autoLabel, label, className = '' }: Props) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-zinc-500 text-xs outline-none max-w-48 bg-transparent cursor-pointer hover:text-zinc-800 non-selectable ${className}`}
    >
      {autoLabel !== undefined && (
        <option value="" className="text-zinc-900">
          {autoLabel}
        </option>
      )}
      {SORTED_LANGUAGES.map((l) => (
        <option key={l.tag} value={l.tag} className="text-zinc-900">
          {l.lang}
        </option>
      ))}
    </select>
  )
}
