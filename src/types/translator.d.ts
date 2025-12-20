// src/types/translator.d.ts

/**
 * A tiny type‑wrapper for the “chrome.i18n.translate” API that you’re using.
 *
 * The real library (e.g. Google’s `@google-translate/api` or a custom wrapper)
 * may expose many more methods; this is just enough for the hook above to compile
 * and for IDE autocomplete to work.
 */

/**
 * The result returned by the translator after a successful translation call.
 */
export interface TranslatorResult {
  /** The translated string. */
  translated: string;
}

/**
 * Monitor object that can receive download‑progress events.
 *
 * In your current code you only listen for `downloadprogress`, but the type
 * is kept generic so you can add more event names later if needed.
 */
export interface Monitor {
  /**
   * Attach an event listener.  
   * The library may expose a typed version of this, but keeping it generic
   * keeps the definition lightweight.
   *
   * @param eventName One of `"downloadprogress"` (and maybe others).
   * @param handler    Callback invoked when the event fires.
   */
  addEventListener(
    eventName: 'downloadprogress',
    handler: (e: { loaded: number }) => void
  ): void;
}

/**
 * The main Translator “class” that you instantiate with `Translator.create`.
 *
 * Only the members you actually use are defined here; feel free to extend.
 */
export interface Translator {
  /**
   * Translate a plain string from the source language to the target language.
   *
   * @param text Text to translate.
   * @returns The translated string.
   */
  translate(text: string): Promise<string>;

  /** Optional – expose the monitor API if you want to listen to progress. */
  // monitor?: (m: Monitor) => void;
}

/**
 * Static helpers that are called before creating a Translator instance.
 */
export interface TranslatorStatic {
  /**
   * Check whether the requested language pair is available, needs download,
   * or is completely unavailable.
   *
   * @param options
   * @returns `'available' | 'downloadable' | 'unavailable'`
   */
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<'available' | 'downloadable' | 'unavailable'>;

  /**
   * Create a Translator instance.
   *
   * @param options
   * @returns A promise that resolves to the translator object.
   */
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    /** Optional monitor callback – you can omit it. */
    monitor?(m: Monitor): void;
  }): Promise<Translator>;
}

/**
 * The exported `Translator` variable you import in your hook:
 *
 * ```ts
 * import { Translator } from './types/translator';
 * ```
 *
 * This is a singleton that implements the static API above.
 */
export const Translator: TranslatorStatic;
