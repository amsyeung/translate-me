import { useState, useEffect } from 'react'

export function useVolume(defaultValue = 1) {
  const [volume, useVolume] = useState(defaultValue)

  useEffect(() => {
    if (chrome.storage) {
      // @ts-ignore
      chrome.storage.sync.get({ volume: defaultValue }, (data) => useVolume(data.volume))
    }
  }, [])

  useEffect(() => {
    const onChange = (changes: any) => changes.volume && useVolume(changes.volume.newValue)
    if (chrome.storage) {
      chrome.storage.onChanged.addListener(onChange)
      return () => chrome.storage.onChanged.removeListener(onChange)
    }
  }, [])

  return volume
}
