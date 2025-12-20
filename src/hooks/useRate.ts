import { useState, useEffect } from 'react'

export function useRate(defaultValue = 0.9) {
  const [rate, setRate] = useState(defaultValue)

  useEffect(() => {
    if (chrome.storage) {
      // @ts-ignore
      chrome.storage.sync.get({ rate: defaultValue }, (data) => setRate(data.rate))
    }
  }, [])

  useEffect(() => {
    const onChange = (changes: any) => changes.rate && setRate(changes.rate.newValue)
    if (chrome.storage) {
      chrome.storage.onChanged.addListener(onChange)
      return () => chrome.storage.onChanged.removeListener(onChange)
    }
  }, [])

  return rate
}
