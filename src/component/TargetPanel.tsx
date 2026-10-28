import LoadingSpinner from './LoadingSpinner'
import LanguageSelect from './LanguageSelect'
import IconButton, { CopyIcon, SpeakerIcon } from './IconButton'
import { copyToClipboard } from '../util/util'
import { requestSpeak } from '../core/messages'
import { languageName } from '../core/languages'
import type { TranslationState } from '../hooks/useTranslation'
import type { WordMeaning } from '../hooks/useWordMeaning'

export default function TargetPanel({
  language,
  onLanguageChange,
  recentLangs,
  state,
  word,
}: {
  language: string
  onLanguageChange: (l: string) => void
  recentLangs: string[]
  state: TranslationState
  word?: WordMeaning | null
}) {
  const text = state.translated
  const busy = state.status === 'working' || state.status === 'downloading'
  const quick = recentLangs.filter((l) => l !== language).slice(0, 4)

  return (
    <div className="relative flex flex-col rounded-lg gap-y-1 p-3 max-w-full mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <LanguageSelect label="Target language" value={language} onChange={onLanguageChange} />
        {quick.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLanguageChange(l)}
            className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 cursor-pointer"
          >
            {languageName(l)}
          </button>
        ))}
      </div>

      <div className="relative min-h-[70px]" aria-live="polite">
        {busy && !text && <LoadingSpinner />}
        {state.status === 'downloading' && (
          <p className="text-xs text-zinc-500 px-1 pt-6">Downloading language model… {Math.round(state.progress * 100)}%</p>
        )}
        {state.status === 'error' && <p className="text-sm text-amber-700 px-1 py-2">{state.error}</p>}
        {text && state.status !== 'error' && (
          <p className={`w-full font-medium text-lg px-1 py-2 leading-[1.25] whitespace-pre-wrap break-words ${busy ? 'opacity-50' : ''}`}>{text}</p>
        )}
        {text && word?.status === 'loading' && <p className="px-1 text-xs text-zinc-400">Looking up the meaning…</p>}
        {text && word?.status === 'done' && (
          <div className="mx-1 mt-1 border-t border-zinc-100 pt-2 text-sm">
            <p>
              {word.partOfSpeech && <span className="mr-1.5 italic text-zinc-400">{word.partOfSpeech}</span>}
              {(word.translatedSense || word.sense) && <strong className="font-semibold">{word.translatedSense || word.sense} — </strong>}
              {word.translatedDefinition || word.definition}
            </p>
            {word.translatedDefinition && word.translatedDefinition !== word.definition && <p className="text-xs text-zinc-500">{word.definition}</p>}
            {word.example && <p className="mt-1 text-xs italic text-zinc-500">e.g. {word.example}</p>}
          </div>
        )}
      </div>

      <div className="self-end inline-flex gap-1">
        <IconButton label="Copy" onClick={() => copyToClipboard(text)} disabled={!text}>
          <CopyIcon />
        </IconButton>
        <IconButton label={`Listen (${languageName(language)})`} onClick={() => requestSpeak(text, language)} disabled={!text}>
          <SpeakerIcon />
        </IconButton>
      </div>
    </div>
  )
}
