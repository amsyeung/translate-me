import bcp47 from './bcp47.json'

interface Settings {
  pitch: number
  rate: number
  volume: number
}

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    // console.log('Text copied to clipboard')
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

export const speak = (text: string, lang: string, settings: Settings) => {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang // Web Speech API uses BCP-47 language tags
  utterance.pitch = settings.pitch
  utterance.rate = settings.rate
  utterance.volume = settings.volume
  speechSynthesis.speak(utterance)
}

export const lookUpLang = (detectedLanguage: string) => {
  const detectedLangCode = detectedLanguage.split('-')[0] // "en", "zh", …

  const langsFound = bcp47.filter((b) => b.tag === detectedLangCode).map((l) => l.lang)

  const result = langsFound.length > 0 ? `${langsFound.join(', ')} - Detected` : 'English - Detected'
  // console.log(result)
  return result
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait = 300 // milliseconds of silence needed
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}
