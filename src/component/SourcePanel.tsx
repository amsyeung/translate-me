import { useRef } from 'react'
import { usePitch } from '../hooks/usePitch'
import { copyToClipboard, speak } from '../util/util'
import LanguageSelect from './LanguageSelect'
import { useRate } from '../hooks/useRate'
import { useVolume } from '../hooks/useVolume'

export default function SourcePanel({
  language,
  onLanguageChange,
  text,
  onTextChange,
  detectedLang,
}: {
  language: string
  onLanguageChange: (l: string) => void
  text: string
  onTextChange: (t: string) => void
  detectedLang?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pitch = usePitch(1.2)
  const rate = useRate(0.9)
  const volume = useVolume(1)

  return (
    <div className="relative flex flex-col rounded-lg gap-y-1 p-3 max-w-full">
      <LanguageSelect source={true} srcLang={language} detectedLang={detectedLang} onChange={onLanguageChange} />

      <textarea
        autoFocus
        ref={ref}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck="false"
        className="min-h-[70px] w-full font-medium text-lg resize-none outline-none px-1 py-2 leading-[1.25]"
      />

      <div className="self-end inline-flex gap-[.75rem]">
        <img
          onClick={() => copyToClipboard(!ref.current ? '' : ref.current.value)}
          className="active:scale-[1.1]"
          src={'/copy.png'}
          width={15}
          height={15}
          alt="Copy Icon"
        />
        <img
          onClick={() => speak(!ref.current ? '' : ref.current.value, language, { pitch: pitch, rate: rate, volume: volume })}
          className="active:scale-[1.1]"
          src={'/speaker.png'}
          width={15}
          height={15}
          alt="Speaker Icon"
        />
      </div>
    </div>
  )
}
