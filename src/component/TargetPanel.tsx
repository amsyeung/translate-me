import { useRef } from 'react'
import LoadingSpinner from './LoadingSpinner'
import LanguageSelect from './LanguageSelect'
import { copyToClipboard, speak } from '../util/util'
import { usePitch } from '../hooks/usePitch'
import { useRate } from '../hooks/useRate'
import { useVolume } from '../hooks/useVolume'

export default function TargetPanel({
  language,
  onLanguageChange,
  text,
  isLoading,
  targetLang,
}: {
  language: string
  onLanguageChange: (l: string) => void
  text: string
  isLoading?: boolean
  targetLang: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const translatedText = isLoading ? '' : text
  const pitch = usePitch(1.2)
  const rate = useRate(0.9)
  const volume = useVolume(1)

  const handleSpeak = async () => {
    if (!targetLang) return
    try {
      await speak(!ref.current ? '' : ref.current.value, targetLang, { pitch, rate, volume })
    } catch (err) {
      console.error('Speech playback failed', err)
    }
  }

  return (
    <div className="relative flex flex-col rounded-lg gap-y-1 p-3 max-w-full mt-3">
      <LanguageSelect srcLang={language} onChange={onLanguageChange} />

      <div className="relative">
        {isLoading && <LoadingSpinner />}

        <textarea
          ref={ref}
          disabled
          value={translatedText}
          spellCheck="false"
          className="min-h-[70px] w-full font-medium text-lg resize-none outline-none px-1 py-2 leading-[1.25]"
        />
      </div>

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
          onClick={handleSpeak}
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
