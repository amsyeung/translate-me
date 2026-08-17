import { useEffect, useRef, useState } from 'react'
import Divider from './component/Divider'
import bcp47 from './util/bcp47.json'
import { debounce } from './util/util'
import { DEFAULT_TARGET_LANG } from './constants'
import type { ExtensionStorage } from './types/storage'

export default function Options() {
  const [srcLang, setSrcLang] = useState('')
  const [tgtLang, setTgtLang] = useState(DEFAULT_TARGET_LANG)
  const [pitch, setPitch] = useState(1.2)
  const [rate, setRate] = useState(0.9)
  const [volume, setVolume] = useState(1)

  // Load current value on mount
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.sync.get({ srcLang: '' }, (data: Pick<ExtensionStorage, 'srcLang'>) => setSrcLang(data.srcLang))
      chrome.storage.sync.get({ tgtLang: DEFAULT_TARGET_LANG }, (data: Pick<ExtensionStorage, 'tgtLang'>) => setTgtLang(data.tgtLang))
      chrome.storage.sync.get({ pitch: 1.2 }, (data: Pick<ExtensionStorage, 'pitch'>) => setPitch(data.pitch))
      chrome.storage.sync.get({ rate: 0.9 }, (data: Pick<ExtensionStorage, 'rate'>) => setRate(data.rate))
      chrome.storage.sync.get({ volume: 1 }, (data: Pick<ExtensionStorage, 'volume'>) => setVolume(data.volume))
    }
  }, [])

  // Slider onChange fires many times per second while dragging; debounce the
  // chrome.storage.sync writes so we don't blow past its write-rate quota.
  const persistPitch = useRef(
    debounce((val: number) => {
      if (chrome.storage) chrome.storage.sync.set({ pitch: val }).catch((err) => console.error('Failed to save pitch', err))
    }, 200)
  ).current
  const persistRate = useRef(
    debounce((val: number) => {
      if (chrome.storage) chrome.storage.sync.set({ rate: val }).catch((err) => console.error('Failed to save rate', err))
    }, 200)
  ).current
  const persistVolume = useRef(
    debounce((val: number) => {
      if (chrome.storage) chrome.storage.sync.set({ volume: val }).catch((err) => console.error('Failed to save volume', err))
    }, 200)
  ).current

  const handleSrcLang = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSrcLang(e.target.value)
    if (chrome.storage) {
      chrome.storage.sync.set({ srcLang: e.target.value }).catch((err) => console.error('Failed to save source language', err))
    }
  }
  const handleTgtLang = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTgtLang(e.target.value)
    if (chrome.storage) {
      chrome.storage.sync.set({ tgtLang: e.target.value }).catch((err) => console.error('Failed to save target language', err))
    }
  }

  // Persist every change (debounced — see persistPitch/persistRate/persistVolume above)
  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setPitch(val)
    persistPitch(val)
  }
  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setRate(val)
    persistRate(val)
  }
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    persistVolume(val)
  }

  return (
    <div className="flex flex-col gap-2 w-[400px] px-5 py-3">
      <div className="grid grid-cols-2 gap-1 py-1.5">
        <label htmlFor="srcLang">Source Language</label>
        <select onChange={handleSrcLang} value={srcLang} className="outline-none" id="srcLang">
          <option value="">Detect Language (recommend)</option>
          {bcp47
            .slice()
            .sort((a, b) => a.lang.localeCompare(b.lang))
            .map((b) => (
              <option key={b.tag} value={b.tag} className="text-zinc-900">
                {b.lang}
              </option>
            ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1 py-1.5">
        <label htmlFor="tgtLang">Target Language</label>
        <select onChange={handleTgtLang} value={tgtLang} className="outline-none" id="tgtLang">
          {bcp47
            .slice()
            .sort((a, b) => a.lang.localeCompare(b.lang))
            .map((b) => (
              <option key={b.tag} value={b.tag} className="text-zinc-900">
                {b.lang}
              </option>
            ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1 py-1.5">
        <label className="mr-5" htmlFor="pitch">
          Pitch
        </label>
        <div className="flex items-center gap-1">
          <input id="pitch" type="range" min={0.5} max={2} step={0.05} value={pitch} onChange={handlePitchChange} className="w-[200px] mt-1" />
          {pitch.toFixed(2)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 py-1.5">
        <label className="mr-5" htmlFor="pitch">
          Rate
        </label>
        <div className="flex items-center gap-1">
          <input type="range" min={0.5} max={2} step={0.05} value={rate} onChange={handleRateChange} className="w-[200px] mt-1" />
          {rate.toFixed(2)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 py-1.5">
        <label className="mr-5" htmlFor="pitch">
          Volume
        </label>
        <div className="flex items-center gap-1">
          <input type="range" min={0.5} max={1} step={0.05} value={volume} onChange={handleVolumeChange} className="w-[200px] mt-1" />
          {volume.toFixed(2)}
        </div>
      </div>

      <Divider />

      <div className="flex flex-col text-justify text-zinc-500 gap-1 mr-2 mt-2">
        <p>If you find this Chrome extension useful, consider showing your appreciation by buying the author a coffee!</p>
        <div className="flex items-center justify-left my-2">
          <a className="underline mr-1" href="https://buymeacoffee.com/amsy" target="_blank" rel="noopener noreferrer">
            <span className="text-semibold text-zinc-800">Buy me a coffee</span>
          </a>
          <img width={15} height={15} src={'/donation.png'} alt="Donation Icon" />
        </div>

        <p>Your contribution helps keep the project maintained, updated, and free for everyone. Thank you!</p>
      </div>
    </div>
  )
}
