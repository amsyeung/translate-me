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

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

// Whether the panel is expanded is a per-browser convenience, so localStorage is enough.
const EXPANDED_KEY = 'highlightBarExpanded'
function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

/** Quick controls for highlight-to-translate, so nobody has to dig into Options. Collapsed to one line by default. */
export default function HighlightBar({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const host = useActiveHostname()
  const shortcuts = useShortcuts()
  const [expanded, setExpanded] = useState(readExpanded)
  const siteOff = Boolean(host) && settings.disabledSites.includes(host)
  const off = !settings.highlightEnabled

  const toggleSite = () => {
    const disabledSites = siteOff ? settings.disabledSites.filter((h) => h !== host) : [...settings.disabledSites, host]
    update({ disabledSites })
  }

  const toggleExpanded = () => {
    setExpanded((v) => {
      try {
        localStorage.setItem(EXPANDED_KEY, v ? '0' : '1')
      } catch {
        /* storage unavailable: just don't remember */
      }
      return !v
    })
  }

  const status = off ? 'Off' : siteOff ? `Off on ${host}` : `On · ${lowerFirst(TRIGGER_MODES.find((m) => m.id === settings.triggerMode)?.label ?? '')}`

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded="false"
        title="Show highlight-to-translate settings"
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-left text-zinc-500 bg-zinc-50 rounded-lg hover:bg-zinc-100 cursor-pointer"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${off || siteOff ? 'bg-zinc-300' : 'bg-emerald-500'}`} aria-hidden="true" />
        <span className="font-semibold text-zinc-700">Translate on select</span>
        <span className="truncate">{status}</span>
        <span className="ml-auto text-zinc-400" aria-hidden="true">
          ▸
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 text-xs text-zinc-600 bg-zinc-50 rounded-lg">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded="true"
        title="Collapse"
        className="self-end -mb-5 text-zinc-400 hover:text-zinc-700 cursor-pointer"
      >
        ▾
      </button>
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
              {lowerFirst(m.label)}
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
