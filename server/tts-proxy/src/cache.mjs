import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * MP3 files on disk keyed by a hash of everything that affects the audio. Least
 * recently used files are deleted once the cache grows past `maxBytes`.
 * Only audio is stored, never the text itself.
 */
export class AudioCache {
  constructor(dir, maxBytes) {
    this.dir = dir
    this.maxBytes = maxBytes
    this.size = 0
    this.sweeping = false
  }

  static key(parts) {
    return createHash('sha256').update(parts.join('␟')).digest('hex')
  }

  path(key) {
    return join(this.dir, key.slice(0, 2), `${key}.mp3`)
  }

  async init() {
    await mkdir(this.dir, { recursive: true })
    this.size = (await this.entries()).reduce((sum, e) => sum + e.size, 0)
  }

  async get(key) {
    const file = this.path(key)
    try {
      const data = await readFile(file)
      if (!data.length) return null // never serve an empty clip
      const now = new Date()
      utimes(file, now, now).catch(() => {}) // mark as recently used
      return data
    } catch {
      return null
    }
  }

  async put(key, data) {
    const file = this.path(key)
    await mkdir(join(this.dir, key.slice(0, 2)), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, file)
    this.size += data.length
    if (this.size > this.maxBytes) this.sweep().catch((err) => console.error('cache sweep failed', err))
  }

  async entries() {
    const out = []
    for (const sub of await readdir(this.dir).catch(() => [])) {
      for (const name of await readdir(join(this.dir, sub)).catch(() => [])) {
        if (!name.endsWith('.mp3')) continue
        const file = join(this.dir, sub, name)
        const s = await stat(file).catch(() => null)
        if (s) out.push({ file, size: s.size, used: s.mtimeMs })
      }
    }
    return out
  }

  /** Delete least recently used files until the cache is at 80% of its cap. */
  async sweep() {
    if (this.sweeping) return
    this.sweeping = true
    try {
      const entries = (await this.entries()).sort((a, b) => a.used - b.used)
      let size = entries.reduce((sum, e) => sum + e.size, 0)
      const target = this.maxBytes * 0.8
      for (const e of entries) {
        if (size <= target) break
        await unlink(e.file).catch(() => {})
        size -= e.size
      }
      this.size = size
    } finally {
      this.sweeping = false
    }
  }
}
