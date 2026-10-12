import { useEffect, useState } from 'react'
import type { Settings, TriggerMode } from '../core/settings'

const MODE_LABELS: Record<TriggerMode, string> = {
  auto: 'Show instantly',
  icon: 'Show a button first',
  modifier: 'Only with Alt / ⌥ held',
}

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

/** Quick controls for highlight-to-translate, so nobody has to dig into Options. */
export default function HighlightBar({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const host = useActiveHostname()
  const siteOff = Boolean(host) && settings.disabledSites.includes(host)

  const toggleSite = () => {
    const disabledSites = siteOff ? settings.disabledSites.filter((h) => h !== host) : [...settings.disabledSites, host]
    update({ disabledSites })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs text-zinc-600 bg-zinc-50 rounded-lg">
      <label className="inline-flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" checked={settings.highlightEnabled} onChange={(e) => update({ highlightEnabled: e.target.checked })} />
        <span className="font-semibold text-zinc-800">Highlight to translate</span>
      </label>
      <select
        aria-label="When to show the translation"
        value={settings.triggerMode}
        disabled={!settings.highlightEnabled}
        onChange={(e) => update({ triggerMode: e.target.value as TriggerMode })}
        className="bg-transparent outline-none cursor-pointer disabled:opacity-40"
      >
        {(Object.keys(MODE_LABELS) as TriggerMode[]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABELS[m]}
          </option>
        ))}
      </select>
      {host && (
        <label className="inline-flex items-center gap-1.5 cursor-pointer" title={host}>
          <input type="checkbox" checked={!siteOff} disabled={!settings.highlightEnabled} onChange={toggleSite} />
          <span className="truncate max-w-40">on {host}</span>
        </label>
      )}
    </div>
  )
}
