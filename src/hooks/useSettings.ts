import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type Settings } from '../core/settings'

/**
 * Live view of the extension settings. Updates from any context (options page,
 * popup, background shortcut) are reflected immediately.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    loadSettings().then((s) => {
      if (!alive) return
      setSettings(s)
      setLoaded(true)
    })
    const unsubscribe = onSettingsChanged((patch) => setSettings((prev) => ({ ...prev, ...patch })))
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    saveSettings(patch).catch((err) => console.error('[translate-me] Failed to save settings', err))
  }, [])

  return { settings, loaded, update }
}
