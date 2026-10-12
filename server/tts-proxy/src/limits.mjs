import { readFile, writeFile, rename } from 'node:fs/promises'

/** Fixed-window counter per key (e.g. per IP per minute). Old windows are pruned lazily. */
export class WindowCounter {
  constructor(limit, windowMs, now = () => Date.now()) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
    this.windows = new Map()
  }

  /** Count one hit; returns seconds to wait if over the limit, else 0. */
  hit(key) {
    const t = this.now()
    let w = this.windows.get(key)
    if (!w || t - w.start >= this.windowMs) {
      w = { start: t, count: 0 }
      this.windows.set(key, w)
    }
    if (w.count >= this.limit) return Math.ceil((w.start + this.windowMs - t) / 1000)
    w.count++
    if (this.windows.size > 10_000) this.prune(t)
    return 0
  }

  prune(t = this.now()) {
    for (const [k, w] of this.windows) if (t - w.start >= this.windowMs) this.windows.delete(k)
  }
}

/** Sliding 60 s window across *all* requests to Azure (F0 hard limit: 20 per 60 s). */
export class SlidingWindow {
  constructor(limit, windowMs = 60_000, now = () => Date.now()) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
    this.stamps = []
  }

  /** Reserve a slot; returns seconds to wait if none is free, else 0. */
  take() {
    const t = this.now()
    while (this.stamps.length && t - this.stamps[0] >= this.windowMs) this.stamps.shift()
    if (this.stamps.length >= this.limit) return Math.ceil((this.stamps[0] + this.windowMs - t) / 1000)
    this.stamps.push(t)
    return 0
  }
}

/**
 * Daily and monthly character budget, persisted so a restart doesn't reset it.
 * Only characters actually sent to Azure count (cache hits are free).
 */
export class Budget {
  constructor(file, dailyLimit, monthlyLimit, now = () => new Date()) {
    this.file = file
    this.dailyLimit = dailyLimit
    this.monthlyLimit = monthlyLimit
    this.now = now
    this.state = { day: '', dayChars: 0, month: '', monthChars: 0 }
    this.saveTimer = null
  }

  async load() {
    try {
      this.state = { ...this.state, ...JSON.parse(await readFile(this.file, 'utf8')) }
    } catch {
      /* first run */
    }
    this.roll()
  }

  roll() {
    const iso = this.now().toISOString()
    const day = iso.slice(0, 10)
    const month = iso.slice(0, 7)
    if (this.state.day !== day) Object.assign(this.state, { day, dayChars: 0 })
    if (this.state.month !== month) Object.assign(this.state, { month, monthChars: 0 })
  }

  /** null if `chars` fits, else which limit it would exceed. */
  check(chars) {
    this.roll()
    if (this.state.dayChars + chars > this.dailyLimit) return 'daily'
    if (this.state.monthChars + chars > this.monthlyLimit) return 'monthly'
    return null
  }

  spend(chars) {
    this.roll()
    this.state.dayChars += chars
    this.state.monthChars += chars
    this.scheduleSave()
  }

  snapshot() {
    this.roll()
    return { ...this.state, dailyLimit: this.dailyLimit, monthlyLimit: this.monthlyLimit }
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save().catch((err) => console.error('budget save failed', err))
    }, 2000)
    this.saveTimer.unref?.()
  }

  async save() {
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(this.state))
    await rename(tmp, this.file)
  }
}
