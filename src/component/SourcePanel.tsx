import { copyToClipboard } from '../util/util'
import { requestSpeak } from '../core/messages'
import { languageName } from '../core/languages'
import type { TranslationState } from '../hooks/useTranslation'
import LanguageSelect from './LanguageSelect'
import IconButton, { CopyIcon, SpeakerIcon } from './IconButton'

function autoLabel(text: string, state: TranslationState): string {
  if (!text.trim()) return 'Detect language'
  if (state.detection?.language) return `${languageName(state.detection.language)} — detected`
  if (state.status === 'working' && !state.detection) return 'Detecting…'
  if (state.detection) return 'Detect language (unsure)'
  return 'Detect language'
}

export default function SourcePanel({
  language,
  onLanguageChange,
  text,
  onTextChange,
  state,
}: {
  language: string
  onLanguageChange: (l: string) => void
  text: string
  onTextChange: (t: string) => void
  state: TranslationState
}) {
  const speakLang = language || state.detection?.language || ''

  return (
    <div className="relative flex flex-col rounded-lg gap-y-1 p-3 max-w-full">
      <LanguageSelect label="Source language" value={language} onChange={onLanguageChange} autoLabel={autoLabel(text, state)} />

      <textarea
        autoFocus
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck="false"
        placeholder="Type or paste text…"
        className="min-h-[70px] w-full font-medium text-lg resize-none outline-none px-1 py-2 leading-[1.25] placeholder:text-zinc-300"
      />

      <div className="self-end inline-flex gap-1">
        <IconButton label="Copy" onClick={() => copyToClipboard(text)} disabled={!text}>
          <CopyIcon />
        </IconButton>
        <IconButton label={speakLang ? `Listen (${languageName(speakLang)})` : 'Listen'} onClick={() => requestSpeak(text, speakLang)} disabled={!text || !speakLang}>
          <SpeakerIcon />
        </IconButton>
      </div>
    </div>
  )
}
