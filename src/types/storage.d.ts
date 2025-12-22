/**
 * Simple key/value store that keeps the user’s translation settings.
 *
 * All properties are persisted in Chrome’s `chrome.storage`.  
 * They are intentionally kept primitive so that they can
 * be serialised without extra work.
 */
export interface Storage {
  /** BCP-47 language code of the source text (e.g. `"en"` or `"zh"`). */
  srcLang: string;

  /** BCP-47 language code of the target text (e.g. `"fr"` or `"ja"`). */
  tgtLang: string;

  /**
   * Voice‑synthesis pitch factor.
   *
   * * Typical range: `0` – `2`.
   * * Value `1` means “normal” pitch.
   */
  pitch: number;

  /**
   * Voice‑synthesis speaking rate.
   *
   * * Typical range: `0.5` – `2`.
   * * Value `1` means “normal” speed.
   */
  rate: number;

  /**
   * Voice‑synthesis volume level.
   *
   * * Range: `0` – `1`.
   * * Value `0` silences the output, `1` is full volume.
   */
  volume: number;
}