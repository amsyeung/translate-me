/**
 * User voice playback configuration settings for Web Speech API
 */
export interface VoiceSettings {
    // Voice tone adjustment, valid range: 0 ~ 2
    pitch: number
    // Speaking speed, valid range: 0.1 ~ 10
    rate: number
    // Audio volume, valid range: 0 (mute) ~ 1 (max volume)
    volume: number
    // Target voice display name to match speech synthesis voices
    voiceName?: string
}

/**
 * Single BCP-47 language tag record loaded from bcp47.json mapping file
 */
export type Bcp47Item = {
    // Short primary language code (e.g. en, zh, ja)
    tag: string
    // Human-readable full language display name
    lang: string
}