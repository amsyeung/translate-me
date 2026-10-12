// Run with: node --test test/
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createApp, parseTtsRequest } from '../src/app.mjs'
import { AzureClient, percent, xmlEscape } from '../src/azure.mjs'
import { AudioCache } from '../src/cache.mjs'
import { Budget, SlidingWindow, WindowCounter } from '../src/limits.mjs'

const ORIGIN = 'chrome-extension://fkoepnkpnaebnedkdnljkcdchljfoadi'
const VOICES = [
  { ShortName: 'zh-HK-HiuMaanNeural', LocalName: '曉曼', Locale: 'zh-HK', Gender: 'Female', VoiceType: 'Neural' },
  { ShortName: 'zh-HK-WanLungNeural', LocalName: '雲龍', Locale: 'zh-HK', Gender: 'Male', VoiceType: 'Neural' },
  { ShortName: 'zh-TW-HsiaoChenNeural', LocalName: '曉臻', Locale: 'zh-TW', Gender: 'Female', VoiceType: 'Neural' },
  { ShortName: 'en-US-AvaNeural', LocalName: 'Ava', Locale: 'en-US', Gender: 'Female', VoiceType: 'Neural' },
  { ShortName: 'en-GB-SoniaNeural', LocalName: 'Sonia', Locale: 'en-GB', Gender: 'Female', VoiceType: 'Neural' },
]

/** A stand-in for Azure: records calls and returns fake MP3 bytes. */
function fakeAzure() {
  const state = { calls: [], status: 200, keySeen: [] }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      state.keySeen.push(req.headers['ocp-apim-subscription-key'])
      if (req.url === '/cognitiveservices/voices/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(VOICES))
      }
      state.calls.push(body)
      if (state.status !== 200) {
        res.writeHead(state.status)
        return res.end()
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
      res.end(Buffer.from(`MP3:${body.length}`))
    })
  })
  return { server, state }
}

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)))

let azure, proxy, base, dataDir, config, budget

async function startProxy(overrides = {}) {
  if (proxy) await new Promise((r) => proxy.close(r))
  dataDir = await mkdtemp(join(tmpdir(), 'tts-proxy-'))
  config = {
    port: 0,
    azureKey: 'test-key',
    azureRegion: 'eastasia',
    azureEndpoint: azure.url,
    allowedOrigins: [ORIGIN],
    dataDir,
    maxChars: 300,
    perIpPerMinute: 100,
    perIpPerDay: 1000,
    azurePerMinute: 100,
    dailyCharLimit: 10_000,
    monthlyCharLimit: 100_000,
    cacheMaxMb: 10,
    ...overrides,
  }
  const cache = new AudioCache(join(dataDir, 'cache'), config.cacheMaxMb * 1024 * 1024)
  await cache.init()
  budget = new Budget(join(dataDir, 'usage.json'), config.dailyCharLimit, config.monthlyCharLimit)
  await budget.load()
  proxy = createApp({ config, azure: new AzureClient(config), cache, budget, log: {} })
  base = await listen(proxy)
}

const tts = (body, headers = {}) =>
  fetch(`${base}/v1/tts`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

before(async () => {
  const fake = fakeAzure()
  azure = { ...fake, url: await listen(fake.server) }
})
after(async () => {
  await new Promise((r) => proxy.close(r))
  await new Promise((r) => azure.server.close(r))
})
beforeEach(async () => {
  azure.state.calls = []
  azure.state.status = 200
  await startProxy()
})

describe('origin checks', () => {
  it('rejects requests without the extension origin', async () => {
    const res = await fetch(`${base}/v1/tts`, { method: 'POST', body: '{}' })
    assert.equal(res.status, 403)
    const other = await tts({ text: 'hi', locales: ['en-US'] }, { Origin: 'https://evil.example' })
    assert.equal(other.status, 403)
    assert.equal(azure.state.calls.length, 0)
  })

  it('answers the CORS preflight for the extension', async () => {
    const res = await fetch(`${base}/v1/tts`, { method: 'OPTIONS', headers: { Origin: ORIGIN } })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN)
  })
})

describe('synthesis', () => {
  it('returns audio, then serves repeats from the cache without calling Azure', async () => {
    const first = await tts({ text: '你好  世界', locales: ['zh-HK', 'zh-TW'] })
    assert.equal(first.status, 200)
    assert.equal(first.headers.get('content-type'), 'audio/mpeg')
    assert.equal(first.headers.get('x-cache'), 'MISS')
    assert.equal(first.headers.get('x-voice'), 'zh-HK-HiuMaanNeural')
    assert.equal(first.headers.get('access-control-allow-origin'), ORIGIN)
    assert.match(Buffer.from(await first.arrayBuffer()).toString(), /^MP3:/)

    const second = await tts({ text: '你好 世界', locales: ['zh-HK'] }) // whitespace-normalized
    assert.equal(second.headers.get('x-cache'), 'HIT')
    assert.equal(azure.state.calls.length, 1)
    assert.equal(budget.snapshot().dayChars, 5)
  })

  it('sends the key only to Azure and escapes text in SSML', async () => {
    await tts({ text: 'a < b & "c"', locales: ['en-US'] })
    assert.ok(azure.state.keySeen.every((k) => k === 'test-key'))
    assert.match(azure.state.calls[0], /a &lt; b &amp; &quot;c&quot;/)
    assert.match(azure.state.calls[0], /en-US-AvaNeural/)
  })

  it('follows the client locale order (Taiwan user gets Mandarin)', async () => {
    const res = await tts({ text: '你好', locales: ['zh-TW', 'zh-HK'] })
    assert.equal(res.headers.get('x-voice'), 'zh-TW-HsiaoChenNeural')
  })

  it('honours a requested voice that matches the language', async () => {
    const res = await tts({ text: '你好', locales: ['zh-HK'], voice: 'zh-HK-WanLungNeural' })
    assert.equal(res.headers.get('x-voice'), 'zh-HK-WanLungNeural')
    const wrong = await tts({ text: '你好', locales: ['zh-HK'], voice: 'en-US-AvaNeural' })
    assert.equal(wrong.headers.get('x-voice'), 'zh-HK-HiuMaanNeural')
  })

  it('shares one Azure call between identical concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => tts({ text: 'same text', locales: ['en-US'] })))
    assert.ok(results.every((r) => r.status === 200))
    assert.equal(azure.state.calls.length, 1)
  })

  it('validates input', async () => {
    assert.equal((await tts({ text: 'x'.repeat(301), locales: ['en-US'] })).status, 413)
    assert.equal((await tts({ text: '', locales: ['en-US'] })).status, 400)
    assert.equal((await tts({ text: 'hi', locales: ['not a locale'] })).status, 400)
    assert.equal((await tts({ text: 'hi', locales: ['sw-KE'] })).status, 404)
    assert.equal(azure.state.calls.length, 0)
  })

  it('maps Azure failures without leaking details', async () => {
    azure.state.status = 401
    const res = await tts({ text: 'hello', locales: ['en-US'] })
    assert.equal(res.status, 502)
    assert.deepEqual(Object.keys(await res.json()).sort(), ['error', 'message'])
    azure.state.status = 429
    const busy = await tts({ text: 'hello again', locales: ['en-US'] })
    assert.equal(busy.status, 503)
    assert.equal(budget.snapshot().dayChars, 0, 'failed calls are not charged')
  })
})

describe('limits', () => {
  it('limits requests per IP', async () => {
    await startProxy({ perIpPerMinute: 2 })
    assert.equal((await tts({ text: 'one', locales: ['en-US'] })).status, 200)
    assert.equal((await tts({ text: 'two', locales: ['en-US'] })).status, 200)
    const third = await tts({ text: 'three', locales: ['en-US'] })
    assert.equal(third.status, 429)
    assert.ok(Number(third.headers.get('retry-after')) > 0)
  })

  it('stops calling Azure when the daily budget is spent, but still serves cached audio', async () => {
    await startProxy({ dailyCharLimit: 10 })
    assert.equal((await tts({ text: 'hello', locales: ['en-US'] })).status, 200)
    const over = await tts({ text: 'hello world', locales: ['en-US'] })
    assert.equal(over.status, 429)
    assert.equal((await over.json()).error, 'daily_budget')
    assert.equal((await tts({ text: 'hello', locales: ['en-US'] })).headers.get('x-cache'), 'HIT')
  })

  it('keeps Azure under its per-minute limit', async () => {
    await startProxy({ azurePerMinute: 1 })
    assert.equal((await tts({ text: 'first', locales: ['en-US'] })).status, 200)
    assert.equal((await tts({ text: 'second', locales: ['en-US'] })).status, 503)
  })

  it('reports health without any text', async () => {
    await tts({ text: 'secret words', locales: ['en-US'] })
    const health = await (await fetch(`${base}/health`)).json()
    assert.equal(health.ok, true)
    assert.ok(!JSON.stringify(health).includes('secret'))
  })
})

describe('units', () => {
  it('WindowCounter resets after its window', () => {
    let t = 0
    const c = new WindowCounter(2, 1000, () => t)
    assert.equal(c.hit('a'), 0)
    assert.equal(c.hit('a'), 0)
    assert.ok(c.hit('a') > 0)
    assert.equal(c.hit('b'), 0)
    t = 1000
    assert.equal(c.hit('a'), 0)
  })

  it('SlidingWindow frees slots as they age out', () => {
    let t = 0
    const w = new SlidingWindow(2, 60_000, () => t)
    assert.equal(w.take(), 0)
    t = 30_000
    assert.equal(w.take(), 0)
    assert.equal(w.take(), 30)
    t = 60_000
    assert.equal(w.take(), 0)
  })

  it('Budget rolls over by day and month and persists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'budget-'))
    let now = new Date('2026-10-31T10:00:00Z')
    const b = new Budget(join(dir, 'u.json'), 100, 150, () => now)
    await b.load()
    b.spend(90)
    assert.equal(b.check(20), 'daily')
    await b.save()
    const reloaded = new Budget(join(dir, 'u.json'), 100, 150, () => now)
    await reloaded.load()
    assert.equal(reloaded.snapshot().dayChars, 90)
    now = new Date('2026-11-01T00:00:01Z')
    assert.equal(reloaded.check(90), null)
    assert.equal(reloaded.snapshot().monthChars, 0)
    await rm(dir, { recursive: true, force: true })
  })

  it('parseTtsRequest clamps and rounds prosody', () => {
    const r = parseTtsRequest(JSON.stringify({ text: ' hi ', locales: ['en-US'], rate: 9, pitch: 0.95000001 }), 300)
    assert.deepEqual(r, { text: 'hi', locales: ['en-US'], voice: undefined, rate: 2, pitch: 0.95 })
  })

  it('SSML helpers', () => {
    assert.equal(xmlEscape(`<a href='x'>&</a>`), '&lt;a href=&apos;x&apos;&gt;&amp;&lt;/a&gt;')
    assert.equal(percent(1), '+0%')
    assert.equal(percent(0.9), '-10%')
    assert.equal(percent(1.25), '+25%')
  })
})
