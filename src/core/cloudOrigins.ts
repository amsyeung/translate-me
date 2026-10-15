import type { Settings, TtsProvider } from './settings'

/** Host permission each cloud voice provider needs (requested at runtime, only if the user opts in). */
export function cloudOrigin(provider: Extract<TtsProvider, 'azure' | 'elevenlabs'>, settings: Pick<Settings, 'azureRegion'>): string {
  return provider === 'azure' ? `https://${settings.azureRegion}.tts.speech.microsoft.com/*` : 'https://api.elevenlabs.io/*'
}
