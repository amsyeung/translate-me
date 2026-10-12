/** All settings come from environment variables (see .env.example). */

const int = (name, fallback) => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`)
  return n
}

const list = (name) =>
  (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function loadConfig() {
  const config = {
    port: int('PORT', 8080),
    azureKey: process.env.AZURE_SPEECH_KEY ?? '',
    azureRegion: process.env.AZURE_SPEECH_REGION ?? 'eastasia',
    // Only for tests: point at a fake Azure server.
    azureEndpoint: process.env.AZURE_ENDPOINT ?? '',
    /** e.g. chrome-extension://fkoepnkpnaebnedkdnljkcdchljfoadi */
    allowedOrigins: list('ALLOWED_ORIGINS'),
    dataDir: process.env.DATA_DIR ?? '/data',

    maxChars: int('MAX_CHARS', 300),
    perIpPerMinute: int('PER_IP_PER_MINUTE', 20),
    perIpPerDay: int('PER_IP_PER_DAY', 400),
    // Azure F0 allows 20 requests per 60 s and ~500k characters a month; stay under both.
    azurePerMinute: int('AZURE_PER_MINUTE', 18),
    dailyCharLimit: int('DAILY_CHAR_LIMIT', 15000),
    monthlyCharLimit: int('MONTHLY_CHAR_LIMIT', 450000),
    cacheMaxMb: int('CACHE_MAX_MB', 300),
  }
  if (!config.azureKey) throw new Error('AZURE_SPEECH_KEY is required')
  if (!/^[a-z0-9]+$/.test(config.azureRegion)) throw new Error('AZURE_SPEECH_REGION looks invalid')
  if (config.allowedOrigins.length === 0) throw new Error('ALLOWED_ORIGINS is required (the extension origin)')
  return config
}

export function azureBase(config) {
  return config.azureEndpoint || `https://${config.azureRegion}.tts.speech.microsoft.com`
}
