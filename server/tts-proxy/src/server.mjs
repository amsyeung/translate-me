import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createApp } from './app.mjs'
import { AzureClient } from './azure.mjs'
import { AudioCache } from './cache.mjs'
import { loadConfig } from './config.mjs'
import { Budget } from './limits.mjs'

const config = loadConfig()
await mkdir(config.dataDir, { recursive: true })

const cache = new AudioCache(join(config.dataDir, 'cache'), config.cacheMaxMb * 1024 * 1024)
await cache.init()
const budget = new Budget(join(config.dataDir, 'usage.json'), config.dailyCharLimit, config.monthlyCharLimit)
await budget.load()
const azure = new AzureClient(config)

const server = createApp({ config, azure, cache, budget })
server.listen(config.port, () => {
  console.log(`tts-proxy listening on :${config.port} (region ${config.azureRegion}, origins: ${config.allowedOrigins.join(', ')})`)
})

const shutdown = async () => {
  server.close()
  await budget.save().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
