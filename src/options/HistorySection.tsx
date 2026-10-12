import { useEffect, useState } from 'react'
import { clearHistory, historyToCsv, loadHistory, type HistoryItem } from '../core/history'
import { languageName } from '../core/languages'
import { Section, buttonClass } from './ui'

const SHOWN = 30

export default function HistorySection({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([])

  useEffect(() => {
    loadHistory().then(setItems)
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && 'history' in changes) setItems((changes.history.newValue as HistoryItem[] | undefined) ?? [])
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  const exportCsv = () => {
    // BOM so Excel opens CJK text correctly.
    const blob = new Blob(['﻿' + historyToCsv(items)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `translate-me-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Section title="History" description="Text you translated with the highlight popover. Stored only on this device; export it as CSV (imports into Anki).">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        Keep a history of highlight translations
      </label>

      {items.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y divide-zinc-100 text-sm max-h-96 overflow-auto">
            {items.slice(0, SHOWN).map((h) => (
              <li key={`${h.at}-${h.text}`} className="py-2 grid grid-cols-2 gap-3">
                <span className="text-zinc-800 break-words">{h.text}</span>
                <span className="text-zinc-600 break-words">
                  {h.translated}
                  <span className="block text-[11px] text-zinc-400">
                    {languageName(h.src)} → {languageName(h.tgt)} · {h.site} · {new Date(h.at).toLocaleDateString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button type="button" className={buttonClass} onClick={exportCsv}>
              Export all ({items.length}) as CSV
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                if (confirm('Delete all saved translations?')) clearHistory()
              }}
            >
              Clear history
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-400">Nothing yet.</p>
      )}
    </Section>
  )
}
