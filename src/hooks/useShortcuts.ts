import { useEffect, useState } from 'react'

/**
 * The keyboard shortcuts as currently bound in chrome://extensions/shortcuts
 * (the user can change them, and Chrome leaves one unbound if it conflicts).
 */
export function useShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  useEffect(() => {
    chrome.commands?.getAll().then((commands) => {
      setShortcuts(Object.fromEntries(commands.filter((c) => c.name && c.shortcut).map((c) => [c.name!, c.shortcut!])))
    })
  }, [])
  return shortcuts
}
