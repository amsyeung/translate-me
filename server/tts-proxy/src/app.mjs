import { createServer } from 'node:http'
import { AudioCache } from './cache.mjs'
import { AzureError } from './azure.mjs'
import { KeyedCharBudget, SlidingWindow, WindowCounter } from './limits.mjs'

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/
const VOICE_ID = /^[A-Za-z0-9-]{3,80}$/
const MAX_BODY = 8 * 1024

class HttpError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

const clamp = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)

/** Collapse whitespace so trivially different selections share one cache entry. */
export const normalizeText = (s) => s.replace(/\s+/g, ' ').trim()

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'body_too_large', 'Request body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Validate a /v1/tts request body; returns a normalized request. */
export function parseTtsRequest(raw, maxChars) {
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'bad_json', 'Body must be JSON')
  }
  const text = typeof body.text === 'string' ? normalizeText(body.text) : ''
  if (!text) throw new HttpError(400, 'no_text', 'text is required')
  if ([...text].length > maxChars) throw new HttpError(413, 'text_too_long', `text is limited to ${maxChars} characters`)
  const locales = Array.isArray(body.locales) ? body.locales.filter((l) => typeof l === 'string' && LOCALE.test(l)).slice(0, 5) : []
  if (!locales.length) throw new HttpError(400, 'no_locale', 'locales must list at least one locale like "zh-HK"')
  const voice = typeof body.voice === 'string' && VOICE_ID.test(body.voice) ? body.voice : undefined
  // Two decimals keep cache keys stable for slider values like 0.9500000001.
  const rate = Math.round(clamp(body.rate, 0.5, 2, 1) * 100) / 100
  const pitch = Math.round(clamp(body.pitch, 0.5, 2, 1) * 100) / 100
  return { text, locales, voice, rate, pitch }
}

export function createApp({ config, azure, cache, budget, log = console }) {
  const perIpMinute = new WindowCounter(config.perIpPerMinute, 60_000)
  const perIpDay = new WindowCounter(config.perIpPerDay, 86_400_000)
  const perIpChars = new KeyedCharBudget(config.perIpCharsPerDay)
  const azureWindow = new SlidingWindow(config.azurePerMinute)
  const inflight = new Map()
  const stats = { started: new Date().toISOString(), requests: 0, cacheHits: 0, azureCalls: 0, rejected: 0 }

  const pruner = setInterval(() => {
    perIpMinute.prune()
    perIpDay.prune()
    perIpChars.prune()
  }, 10 * 60_000)
  pruner.unref()

  function cors(req, res) {
    const origin = req.headers.origin
    if (!origin || !config.allowedOrigins.includes(origin)) return false
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    return true
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders })
    res.end(JSON.stringify(body))
  }

  /** Count the request against its IP's limits; returns the IP (kept in memory only). */
  function limitByIp(req) {
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown'
    const wait = perIpMinute.hit(ip) || perIpDay.hit(ip)
    if (wait) throw new HttpError(429, 'rate_limited', 'Too many requests, slow down', wait)
    return ip
  }

  async function synthesize({ text, locales, voice: requested, rate, pitch }, ip) {
    const voice = await azure.pickVoice(locales, requested)
    if (!voice) throw new HttpError(404, 'no_voice', `No voice for ${locales.join(', ')}`)
    const key = AudioCache.key([voice.id, rate, pitch, text])

    const cached = await cache.get(key)
    if (cached) {
      stats.cacheHits++
      return { audio: cached, voice, hit: true }
    }

    // Identical concurrent requests share one Azure call.
    let pending = inflight.get(key)
    if (!pending) {
      pending = (async () => {
        const chars = [...text].length
        const ipWait = perIpChars.check(ip, chars)
        if (ipWait) throw new HttpError(429, 'personal_budget', "You've used today's share of the free voices; try again tomorrow", ipWait)
        const over = budget.check(chars)
        if (over) throw new HttpError(429, `${over}_budget`, `The shared ${over} character budget is used up; try again later`, over === 'daily' ? 3600 : 86400)
        const wait = azureWindow.take()
        if (wait) throw new HttpError(503, 'busy', 'The voice service is busy; try again shortly', wait)
        stats.azureCalls++
        const audio = await azure.synthesize(text, voice, rate, pitch)
        budget.spend(chars)
        perIpChars.spend(ip, chars)
        // Azure answers 200 with no audio for text it can't speak; don't cache that, let the client fall back.
        if (!audio.length) throw new HttpError(422, 'no_audio', 'The voice service returned no audio for this text')
        await cache.put(key, audio)
        return audio
      })().finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    return { audio: await pending, voice, hit: false }
  }

  const server = createServer(async (req, res) => {
    const started = Date.now()
    const url = new URL(req.url ?? '/', 'http://localhost')
    stats.requests++
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, budget: budget.snapshot(), cacheMb: Math.round(cache.size / 1e5) / 10, stats })
      }

      if (url.pathname !== '/v1/tts' && url.pathname !== '/v1/voices') throw new HttpError(404, 'not_found', 'Not found')
      // Browsers enforce this; other clients can forge Origin, which is why the limits below exist too.
      if (!cors(req, res)) throw new HttpError(403, 'origin', 'Origin not allowed')

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        })
        return res.end()
      }

      if (req.method === 'GET' && url.pathname === '/v1/voices') {
        const locales = (url.searchParams.get('locales') ?? '').split(',').filter((l) => LOCALE.test(l))
        const wanted = new Set(locales.map((l) => l.toLowerCase()))
        const voices = (await azure.listVoices()).filter((v) => wanted.has(v.locale.toLowerCase()))
        return sendJson(res, 200, { voices }, { 'Cache-Control': 'public, max-age=86400' })
      }

      if (req.method !== 'POST' || url.pathname !== '/v1/tts') throw new HttpError(405, 'method', 'Method not allowed')

      const ip = limitByIp(req)
      const request = parseTtsRequest(await readBody(req), config.maxChars)
      const { audio, voice, hit } = await synthesize(request, ip)
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length,
        'Cache-Control': 'no-store',
        'X-Cache': hit ? 'HIT' : 'MISS',
        'X-Voice': voice.id,
        'Access-Control-Expose-Headers': 'X-Cache, X-Voice',
      })
      res.end(audio)
      // Never log the text or the IP.
      log.info?.(`tts ${hit ? 'hit ' : 'miss'} ${voice.id} ${request.text.length}ch ${Date.now() - started}ms`)
    } catch (err) {
      stats.rejected++
      if (err instanceof HttpError) {
        const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {}
        if (err.status >= 500 || err.status === 429) log.warn?.(`reject ${err.status} ${err.code}`)
        return sendJson(res, err.status, { error: err.code, message: err.message }, headers)
      }
      if (err instanceof AzureError) {
        log.error?.(`azure error ${err.status}`)
        if (err.status === 429) return sendJson(res, 503, { error: 'busy', message: 'The voice service is busy; try again shortly' }, { 'Retry-After': '10' })
        return sendJson(res, 502, { error: 'upstream', message: 'The voice service failed' })
      }
      log.error?.('unexpected error', err)
      sendJson(res, 500, { error: 'internal', message: 'Internal error' })
    }
  })
  server.on('close', () => clearInterval(pruner))
  return server
}
