/**
 * Single BCP-47 language tag record loaded from bcp47.json mapping file.
 * `tag` matches the Chrome Translator/LanguageDetector API's language code
 * space exactly (e.g. `zh` vs `zh-Hant`, script subtags — not region).
 * `regions` lists full locale tags (e.g. `zh-CN`), used to pick a
 * matching speechSynthesis voice, which is a separate, region-based
 * tag space from the Translator API.
 */
export type Bcp47Item = {
    // Translator/LanguageDetector API language code (e.g. en, zh, zh-Hant)
    tag: string
    // Human-readable full language display name
    lang: string
    // Candidate speechSynthesis voice locales for this language, in priority order
    regions?: string[]
    // Human-readable description per region, same order as `regions`
    descriptions?: string[]
}