import { useState, useEffect } from 'react'

export function useStorageValue<T>(key: string, defaultValue: T): T {
  const [value, setValue] = useState<T>(defaultValue)

  useEffect(() => {
    if (!chrome.storage) return
    chrome.storage.sync.get({ [key]: defaultValue }, (data) => setValue(data[key] as T))
  }, [key, defaultValue])

  useEffect(() => {
    if (!chrome.storage) return
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (key in changes) setValue(changes[key].newValue as T)
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [key])

  return value
}
