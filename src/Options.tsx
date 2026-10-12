import { SORTED_LANGUAGES } from './core/languages'
import { setTargetLanguage, type TriggerMode } from './core/settings'
import { useSettings } from './hooks/useSettings'
import HistorySection from './options/HistorySection'
import VoiceSection from './options/VoiceSection'
import { Row, Section, buttonClass, inputClass } from './options/ui'

const TRIGGER_MODES: { id: TriggerMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Show instantly', hint: 'The translation appears as soon as you select text.' },
  { id: 'icon', label: 'Show a button first', hint: 'A small button appears; click it to translate. Least intrusive.' },
  { id: 'modifier', label: 'Only while holding Alt (⌥ Option on Mac)', hint: 'Select text with Alt held down.' },
]

const AUTO_HIDE = [
  { value: 0, label: 'Never — close with Esc or a click elsewhere' },
  { value: 5, label: 'After 5 seconds' },
  { value: 10, label: 'After 10 seconds' },
  { value: 20, label: 'After 20 seconds' },
]

function LanguageOptions() {
  return SORTED_LANGUAGES.map((l) => (
    <option key={l.tag} value={l.tag}>
      {l.lang}
    </option>
  ))
}

export default function Options() {
  const { settings, loaded, update } = useSettings()
  if (!loaded) return null

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <header>
        <h1 className="text-2xl! font-semibold text-zinc-900">translate me — Settings</h1>
        <p className="text-sm text-zinc-500">Translation runs on your device with Chrome&apos;s built-in model. Nothing you translate is sent anywhere.</p>
      </header>

      <Section title="Languages">
        <Row label="Translate into" htmlFor="tgtLang">
          <select id="tgtLang" className={inputClass} value={settings.tgtLang} onChange={(e) => setTargetLanguage(e.target.value)}>
            <LanguageOptions />
          </select>
        </Row>
        <Row label="Source language" htmlFor="srcLang" hint="Auto-detect is recommended">
          <select id="srcLang" className={inputClass} value={settings.srcLang} onChange={(e) => update({ srcLang: e.target.value })}>
            <option value="">Detect automatically</option>
            <LanguageOptions />
          </select>
        </Row>
        <Row label="Bilingual pair" htmlFor="pairLang" hint="When the text is already in your target language, translate it into this one instead">
          <select id="pairLang" className={inputClass} value={settings.pairLang} onChange={(e) => update({ pairLang: e.target.value })}>
            <option value="">Off</option>
            <LanguageOptions />
          </select>
        </Row>
      </Section>

      <Section title="Highlight to translate" description="Select text on any page to see its translation next to it.">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={settings.highlightEnabled} onChange={(e) => update({ highlightEnabled: e.target.checked })} />
          Enabled
        </label>
        <Row label="When to show">
          <div className="flex flex-col gap-2">
            {TRIGGER_MODES.map((m) => (
              <label key={m.id} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="trigger" className="mt-1" checked={settings.triggerMode === m.id} onChange={() => update({ triggerMode: m.id })} />
                <span>
                  {m.label}
                  <span className="block text-xs text-zinc-400">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Row>
        <Row label="Hide the popover" htmlFor="autoHide" hint="Hovering or pinning always keeps it open">
          <select id="autoHide" className={inputClass} value={settings.autoHideSeconds} onChange={(e) => update({ autoHideSeconds: Number(e.target.value) })}>
            {AUTO_HIDE.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Text fields">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.skipEditable} onChange={(e) => update({ skipEditable: e.target.checked })} />
            Ignore selections inside text boxes and editors
          </label>
        </Row>
        <Row label="Turned off on" hint="Add sites from the toolbar popup">
          {settings.disabledSites.length === 0 && <span className="text-zinc-400">No sites</span>}
          {settings.disabledSites.map((host) => (
            <span key={host} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
              {host}
              <button
                type="button"
                aria-label={`Turn back on for ${host}`}
                className="text-zinc-400 hover:text-zinc-800 cursor-pointer"
                onClick={() => update({ disabledSites: settings.disabledSites.filter((h) => h !== host) })}
              >
                ×
              </button>
            </span>
          ))}
        </Row>
        <Row label="Keyboard shortcuts" hint="Toggle highlight-to-translate, or translate the current selection">
          <button type="button" className={buttonClass} onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Configure shortcuts…
          </button>
        </Row>
      </Section>

      <VoiceSection settings={settings} update={update} />

      <HistorySection enabled={settings.saveHistory} onToggle={(saveHistory) => update({ saveHistory })} />

      <footer className="flex flex-col gap-1 text-sm text-zinc-500 pb-6">
        <p>If you find this extension useful, consider buying the author a coffee — it keeps the project maintained and free for everyone. Thank you!</p>
        <a className="inline-flex items-center gap-1 underline text-zinc-800 w-fit" href="https://buymeacoffee.com/amsy" target="_blank" rel="noopener noreferrer">
          Buy me a coffee <img width={15} height={15} src="/donation.png" alt="" />
        </a>
      </footer>
    </main>
  )
}
