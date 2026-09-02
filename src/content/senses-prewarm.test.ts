/**
 * `senses-prewarm.ts` tests (`spec/tasks/25-offline-update.md` §1's runtime-cache fallback).
 * Same fake `Cache`/`CacheStorage` convention as `features/settings/lib/paradigm-prefetch.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SENSES_SHARD_COUNT } from './codec.ts'
import { prewarmSensesCache } from './senses-prewarm.ts'

class FakeCache {
  store = new Map<string, Response>()
  async match(url: string): Promise<Response | undefined> {
    return this.store.get(url)
  }
  async put(url: string, response: Response): Promise<void> {
    this.store.set(url, response)
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

let fakeCaches: FakeCacheStorage

beforeEach(() => {
  fakeCaches = new FakeCacheStorage()
  vi.stubGlobal('caches', fakeCaches)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeFetchMock() {
  return vi.fn(async (url: unknown) => ({ ok: true, status: 200, url: String(url) }) as Response)
}

describe('prewarmSensesCache', () => {
  it('fetches all 16 shards into "senses-<contentVersion>"', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    await prewarmSensesCache('v1')

    expect(fetchMock).toHaveBeenCalledTimes(SENSES_SHARD_COUNT)
    const cache = fakeCaches.caches.get('senses-v1')
    expect(cache?.store.size).toBe(SENSES_SHARD_COUNT)
  })

  it('skips a shard already present in the cache (no re-fetch)', async () => {
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    await prewarmSensesCache('v1')
    fetchMock.mockClear()

    await prewarmSensesCache('v1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops silently (no throw) on a fetch failure — e.g. offline this boot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(prewarmSensesCache('v1')).resolves.toBeUndefined()
  })

  it('is a no-op when Cache Storage is unavailable', async () => {
    vi.unstubAllGlobals()
    await expect(prewarmSensesCache('v1')).resolves.toBeUndefined()
  })
})
