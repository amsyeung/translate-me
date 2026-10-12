import { useEffect, useState } from 'react'
import { TRIGGER_MODES, type Settings, type TriggerMode } from '../core/settings'
import { useShortcuts } from '../hooks/useShortcuts'

function useActiveHostname(): string {
  const [host, setHost] = useState('')
  useEffect(() => {
    if (!chrome.tabs?.query) return
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      try {
        const url = tab?.url ? new URL(tab.url) : null
        if (url && /^https?:$/.test(url.protocol)) setHost(url.hostname)
      } catch {
        /* not a web page */
      }
    })
  }, [])
  return host
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border border-zinc-300 bg-white px-1 font-sans text-[10px] text-zinc-600">{children}</kbd>
)

/** Quick controls for highlight-to-translate, so nobody has to dig into Options. */
export default function HighlightBar({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const host = useActiveHostname()
  const shortcuts = useShortcuts()
  const siteOff = Boolean(host) && settings.disabledSites.includes(host)
  const off = !settings.highlightEnabled

  const toggleSite = () => {
    const disabledSites = siteOff ? settings.disabledSites.filter((h) => h !== host) : [...settings.disabledSites, host]
    update({ disabledSites })
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 text-xs text-zinc-600 bg-zinc-50 rounded-lg">
      <label className="inline-flex items-center gap-1.5 cursor-pointer" title="Show a translation next to text you select on web pages">
        <input type="checkbox" checked={settings.highlightEnabled} onChange={(e) => update({ highlightEnabled: e.target.checked })} />
        <span className="font-semibold text-zinc-800">Translate text I select on web pages</span>
      </label>

      <label className={`inline-flex items-center gap-1.5 pl-5 ${off ? 'opacity-40' : ''}`}>
        <span>Show it</span>
        <select
          aria-label="When to show the translation"
          title={TRIGGER_MODES.find((m) => m.id === settings.triggerMode)?.hint}
          value={settings.triggerMode}
          disabled={off}
          onChange={(e) => update({ triggerMode: e.target.value as TriggerMode })}
          className="bg-transparent outline-none cursor-pointer text-zinc-800 underline decoration-dotted underline-offset-2"
        >
          {TRIGGER_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label.charAt(0).toLowerCase() + m.label.slice(1)}
            </option>
          ))}
        </select>
      </label>

      {host && (
        <label
          className={`inline-flex items-center gap-1.5 pl-5 cursor-pointer ${off ? 'opacity-40' : ''}`}
          title="Untick to stop translations popping up on this site only. Sites you turn off are listed in Settings."
        >
          <input type="checkbox" checked={!siteOff} disabled={off} onChange={toggleSite} />
          <span className="truncate max-w-72">
            Also on this site <span className="text-zinc-400">({host})</span>
          </span>
        </label>
      )}

      {(shortcuts['translate-selection'] || shortcuts['toggle-highlight']) && (
        <p className="pl-5 text-[11px] text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
          {shortcuts['translate-selection'] && (
            <span>
              <Kbd>{shortcuts['translate-selection']}</Kbd> translate selection
            </span>
          )}
          {shortcuts['toggle-highlight'] && (
            <span>
              <Kbd>{shortcuts['toggle-highlight']}</Kbd> turn on/off
            </span>
          )}
        </p>
      )}
    </div>
  )
}
