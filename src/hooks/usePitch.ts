import { useState, useEffect } from 'react'

export function usePitch(defaultValue = 1.2) {
  const [pitch, setPitch] = useState(defaultValue)

  useEffect(() => {
    if (chrome.storage) {
      // @ts-ignore
      chrome.storage.sync.get({ pitch: defaultValue }, (data) => setPitch(data.pitch))
    }
  }, [])

  useEffect(() => {
    const onChange = (changes: any) => changes.pitch && setPitch(changes.pitch.newValue)
    if (chrome.storage) {
      chrome.storage.onChanged.addListener(onChange)
      return () => chrome.storage.onChanged.removeListener(onChange)
    }
  }, [])

  return pitch
}
