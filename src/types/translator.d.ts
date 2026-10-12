/**
 * Ambient declarations for Chrome's built-in AI APIs (Chrome 138+).
 * Only the members this extension uses are declared.
 * https://developer.chrome.com/docs/ai/translator-api
 * https://developer.chrome.com/docs/ai/language-detection
 */

export type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

/** Fired while a model is being downloaded; `loaded` is a 0..1 fraction. */
export interface DownloadProgressEvent extends Event {
  readonly loaded: number
}

export interface CreateMonitor extends EventTarget {
  addEventListener(type: 'downloadprogress', listener: (ev: DownloadProgressEvent) => void, options?: boolean | AddEventListenerOptions): void
}

interface CreateOptions {
  signal?: AbortSignal
  monitor?(m: CreateMonitor): void
}

export interface TranslatorInstance {
  readonly sourceLanguage: string
  readonly targetLanguage: string
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>
  translateStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>
  destroy(): void
}

export interface TranslatorStatic {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<AIAvailability>
  create(options: { sourceLanguage: string; targetLanguage: string } & CreateOptions): Promise<TranslatorInstance>
}

export interface LanguageDetectionResult {
  /** BCP 47 tag, e.g. `en`, `zh`, `zh-Latn`. `und` means undetermined. */
  detectedLanguage: string
  /** 0..1, results are sorted from most to least likely. */
  confidence: number
}

export interface LanguageDetectorInstance {
  detect(input: string, options?: { signal?: AbortSignal }): Promise<LanguageDetectionResult[]>
  destroy(): void
}

export interface LanguageDetectorStatic {
  availability(options?: { expectedInputLanguages?: string[] }): Promise<AIAvailability>
  create(options?: { expectedInputLanguages?: string[] } & CreateOptions): Promise<LanguageDetectorInstance>
}

declare global {
  // Only present on Chrome desktop 138+; always feature-detect before use.
  var Translator: TranslatorStatic | undefined
  var LanguageDetector: LanguageDetectorStatic | undefined
}
