import bcp47 from '../util/bcp47.json'
import { lookUpLang } from '../util/util'

type Props = {
  source?: boolean
  srcLang: string
  detectedLang?: string
  onChange: (lang: string) => void
}

export default function LanguageSelect({ source, srcLang, detectedLang, onChange }: Props) {
  return (
    <select value={srcLang} onChange={(e) => onChange(e.target.value)} className="text-zinc-400 text-xs outline-none w-28 non-selectable">
      {source ? (
        <option value="" className="text-zinc-900">
          {!detectedLang ? 'Detect language' : lookUpLang(detectedLang)}
        </option>
      ) : (
        <option value="" className="text-zinc-900" disabled>
          {'Choose language'}
        </option>
      )}

      {bcp47
        .slice()
        .sort((a, b) => a.lang.localeCompare(b.lang))
        .map((b) => (
          <option key={b.tag} value={b.tag} className="text-zinc-900">
            {b.lang}
          </option>
        ))}
    </select>
  )
}
