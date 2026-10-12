/**
 * Small IndexedDB cache for cloud TTS audio, so replaying a word or phrase costs
 * nothing. Keyed by a hash of everything that affects the audio. Oldest entries are
 * evicted beyond MAX_ENTRIES.
 */

const DB_NAME = 'translate-me-tts'
const STORE = 'audio'
const MAX_ENTRIES = 400

interface Entry {
  key: string
  mime: string
  data: ArrayBuffer
  at: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex('at', 'at')
    }
    req.onsuccess = () => {
      req.result.onclose = () => (dbPromise = null)
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = () => resolve(req ? req.result : undefined)
        t.onerror = () => reject(t.error)
        // Quota errors at commit time only fire `abort`; without this the promise would hang.
        t.onabort = () => reject(t.error ?? new DOMException('Transaction aborted', 'AbortError'))
      })
  )
}

export async function cacheKey(parts: (string | number)[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join('␟'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getCachedAudio(key: string): Promise<{ mime: string; data: ArrayBuffer } | null> {
  try {
    const entry = (await tx<Entry>('readonly', (s) => s.get(key))) ?? null
    if (entry) tx('readwrite', (s) => void s.put({ ...entry, at: Date.now() })).catch(() => {})
    return entry
  } catch {
    return null
  }
}

export async function putCachedAudio(key: string, mime: string, data: ArrayBuffer): Promise<void> {
  try {
    await tx('readwrite', (s) => void s.put({ key, mime, data, at: Date.now() } satisfies Entry))
    const count = (await tx<number>('readonly', (s) => s.count())) ?? 0
    if (count <= MAX_ENTRIES) return
    await tx('readwrite', (s) => {
      let excess = count - MAX_ENTRIES
      s.index('at').openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor || excess-- <= 0) return
        cursor.delete()
        cursor.continue()
      }
    })
  } catch (err) {
    console.warn('[translate-me] TTS cache write failed', err)
  }
}

export async function clearAudioCache(): Promise<void> {
  await tx('readwrite', (s) => void s.clear())
}
