/**
 * The result returned by the translator after a successful translation call.
 */
export interface TranslatorResult {
  /** The translated string. */
  translated: string;
}

/**
 * Generic monitor that can receive download‑progress events.
 *
 * The library exposes only one event for now (`downloadprogress`), but the
 * shape is kept open so you can add more event types in the future without
 * touching the interface again.
 */
export interface Monitor {
  /**
   * Attach an event listener.
   *
   * @param type     One of `"downloadprogress"` (and potentially others).
   * @param listener Callback invoked when the event fires.  
   *                 The `this` context is the monitor itself.
   * @param options  Optional parameters accepted by the native
   *                 {@link EventTarget.addEventListener} API.
   */
  addEventListener(
    type: 'downloadprogress',
    listener: (this: Monitor, ev: DownloadProgressEventTarget) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
}

/**
 * Result of a language‑detection operation.
 */
export interface Detected {
  /** BCP-47 language code (e.g. `"en"` or `"fr"`). */
  language: string;
}

/**
 * Core translator “class” that you obtain via {@link Translator.create}.
 *
 * Only the members you actually use are declared here; feel free to extend
 * the interface with additional helpers if the underlying library exposes them.
 */
export interface Translator {
  /**
   * Translate a plain string from the source language to the target language.
   *
   * @param text Text to translate.
   * @returns A promise that resolves to the translated string.
   */
  translate(text: string): Promise<string>;
}

/**
 * Static helpers used before creating a {@link Translator} instance.
 */
export interface TranslatorStatic {
  /**
   * Check whether the requested language pair is available, needs download,
   * or is completely unavailable.
   *
   * @param options Object containing source/target language codes.
   * @returns A promise resolving to one of:
   *          `'available' | 'downloadable' | 'unavailable'`.
   */
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<'available' | 'downloadable' | 'unavailable'>;

  /**
   * Create a Translator instance.
   *
   * @param options Configuration for the translator.
   * @returns A promise that resolves to a {@link Translator} object.
   */
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    /** Optional monitor callback – you can omit it. */
    monitor?(m: Monitor): void;
  }): Promise<Translator>;
}

/**
 * Static helpers for the language‑detector component.
 */
export interface LanguageDetectorStatic {
  /**
   * Check whether the language detector is available, needs download,
   * or is completely unavailable.
   *
   * @returns A promise resolving to one of:
   *          `'available' | 'downloadable' | 'unavailable'`.
   */
  availability(): Promise<'available' | 'downloadable' | 'unavailable'>;

  /**
   * Create a LanguageDetector instance.
   *
   * @param options Optional configuration object (currently unused).
   * @returns A promise that resolves to an object exposing a `detect` method.
   */
  create(options?: {}): Promise<{
    detect(text: string): Promise<
      { detectedLanguage: string; confidence: number }[]
    >;
  }>;
}
