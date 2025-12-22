import { useEffect, useState } from 'react'
import Divider from './component/Divider'
import bcp47 from './util/bcp47.json'

export default function Options() {
  const [srcLang, setSrcLang] = useState('')
  const [tgtLang, setTgtLang] = useState('en')
  const [pitch, setPitch] = useState(1.2)
  const [rate, setRate] = useState(0.9)
  const [volume, setVolume] = useState(1)

  // Load current value on mount
  useEffect(() => {
    if (chrome.storage) {
      chrome.storage.sync.get({ srcLang: '' }, (data: Storage) => setSrcLang(data.srcLang))
      chrome.storage.sync.get({ tgtLang: 'en' }, (data: Storage) => setTgtLang(data.tgtLang))
      chrome.storage.sync.get({ pitch: 1.2 }, (data: Storage) => setPitch(data.pitch))
      chrome.storage.sync.get({ rate: 0.9 }, (data: Storage) => setRate(data.rate))
      chrome.storage.sync.get({ volume: 1 }, (data: Storage) => setVolume(data.volume))
    }
  }, [])

  const handleSrcLang = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSrcLang(e.target.value)
    if (chrome.storage) {
      chrome.storage.sync.set({ srcLang: e.target.value })
    }
  }
  const handleTgtLang = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTgtLang(e.target.value)
    if (chrome.storage) {
      chrome.storage.sync.set({ tgtLang: e.target.value })
    }
  }

  // Persist every change
  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setPitch(val)
    if (chrome.storage) {
      chrome.storage.sync.set({ pitch: val })
    }
  }
  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setRate(val)
    if (chrome.storage) {
      chrome.storage.sync.set({ rate: val })
    }
  }
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (chrome.storage) {
      chrome.storage.sync.set({ volume: val })
    }
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
