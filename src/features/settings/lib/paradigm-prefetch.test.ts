/**
 * `paradigm-prefetch.ts` tests (`spec/tasks/24-settings-backup.md` acceptance points 8-9:
 * progress + cancellation, and "формы любого слова открываются в офлайне" once done).
 *
 * jsdom has no `CacheStorage` implementation, so this stubs a minimal in-memory fake — just
 * enough of `Cache`/`CacheStorage` (`open`, `match`, `put`, `keys`) for these tests, same
 * "stub the platform API, not the module under test" convention `content/loader.test.ts`
 * already uses for `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARADIGMS_SHARD_COUNT } from '@/content/codec.ts'
import {
  checkStorageQuota,
  isAbortError,
  isParadigmPrefetchComplete,
  paradigmCacheName,
  prefetchAllParadigmShards,
} from './paradigm-prefetch.ts'

class FakeCache {
  store = new Map<string, Response>()
  async match(url: string): Promise<Response | undefined> {
    return this.store.get(url)
  }
  async put(url: string, response: Response): Promise<void> {
    this.store.set(url, response)
  }
  async keys(): Promise<string[]> {
    return [...this.store.keys()]
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>()
  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name)
    if (!cache) {
      cache = new FakeCache()
      this.caches.set(name, cache)
    }
    return cache
  }
}

function makeFetchMock() {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    return { ok: true, status: 200, json: async () => ({}), url: String(url) } as Response
  })
}

let fakeCaches: FakeCacheStorage

beforeEach(() => {
  fakeCaches = new FakeCacheStorage()
  vi.stubGlobal('caches', fakeCaches)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('paradigmCacheName', () => {
  it('is "paradigms-<contentVersion>" — the exact convention task 25 must also use', () => {
    expect(paradigmCacheName('a1b2c3d4e5f6')).toBe('paradigms-a1b2c3d4e5f6')
  })
})

describe('prefetchAllParadigmShards', () => {
  it('fetches all 64 shards, reporting progress from 0 to 64 (acceptance point 8)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const progress: number[] = []

    await prefetchAllParadigmShards(
      'v1',
      (p) => progress.push(p.done),
      new AbortController().signal,
    )

    expect(fetchMock).toHaveBeenCalledTimes(PARADIGMS_SHARD_COUNT)
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(PARADIGMS_SHARD_COUNT)
    expect(progress).toHaveLength(PARADIGMS_SHARD_COUNT + 1)
    // Monotonically increasing, one step at a time.
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBe((progress[i - 1] as number) + 1)
    }
  })

  it('writes every shard under the "paradigms-<contentVersion>" cache name', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    await prefetchAllParadigmShards('a1b2c3d4e5f6', () => {}, new AbortController().signal)

    const cache = fakeCaches.caches.get('paradigms-a1b2c3d4e5f6')
    expect(cache).toBeDefined()
    expect(cache?.store.size).toBe(PARADIGMS_SHARD_COUNT)
  })

  it('skips a shard already present in the cache on a second run (no re-fetch)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    await prefetchAllParadigmShards('v1', () => {}, new AbortController().signal)
    fetchMock.mockClear()

    await prefetchAllParadigmShards('v1', () => {}, new AbortController().signal)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is cancelable — an already-aborted signal throws an AbortError before any fetch (acceptance point 8)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    await expect(prefetchAllParadigmShards('v1', () => {}, controller.signal)).rejects.toSatisfy(
      (e: unknown) => isAbortError(e),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is cancelable mid-run — stops issuing new fetches once aborted', async () => {
    const controller = new AbortController()
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        calls++
        if (calls === 5) controller.abort()
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        return { ok: true, status: 200, json: async () => ({}), url: String(url) } as Response
      }),
    )

    await expect(
      prefetchAllParadigmShards('v1', () => {}, controller.signal),
    ).rejects.toSatisfy((e: unknown) => isAbortError(e))
    expect(calls).toBeLessThan(PARADIGMS_SHARD_COUNT)
  })

  it('propagates a real HTTP failure as a plain (non-abort) error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    )
    await expect(
      prefetchAllParadigmShards('v1', () => {}, new AbortController().signal),
    ).rejects.toThrow(/404/)
  })
})

describe('isParadigmPrefetchComplete', () => {
  it('is false before any prefetch has run', async () => {
    expect(await isParadigmPrefetchComplete('v1')).toBe(false)
  })

  it('is true once all 64 shards have been cached', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    await prefetchAllParadigmShards('v1', () => {}, new AbortController().signal)
    expect(await isParadigmPrefetchComplete('v1')).toBe(true)
  })

  it('is false for a different contentVersion (separate cache)', async () => {
    vi.stubGlobal('fetch', makeFetchMock())
    await prefetchAllParadigmShards('v1', () => {}, new AbortController().signal)
    expect(await isParadigmPrefetchComplete('v2')).toBe(false)
  })
})

describe('checkStorageQuota', () => {
  it('is ok when plenty of space is available', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 1_000_000, quota: 1_000_000_000 }) },
    })
    const result = await checkStorageQuota()
    expect(result.ok).toBe(true)
    expect(result.availableBytes).toBe(999_000_000)
  })

  it('is not ok when available space is below the threshold', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 999_000_000, quota: 1_000_000_000 }) },
    })
    const result = await checkStorageQuota()
    expect(result.ok).toBe(false)
    expect(result.availableBytes).toBe(1_000_000)
  })

  it('reports ok with a null availableBytes when the Storage API is unsupported', async () => {
    vi.stubGlobal('navigator', {})
    const result = await checkStorageQuota()
    expect(result).toEqual({ ok: true, availableBytes: null })
  })
})
