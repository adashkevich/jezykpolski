/**
 * `stale-cache-cleanup.ts` tests (`spec/tasks/25-offline-update.md` §2: "Старые кэши
 * удаляются в activate" / acceptance "Смена contentVersion инвалидирует кэш парадигм и
 * удаляет старый"). Same "stub the platform API" fake `CacheStorage` convention as
 * `features/settings/lib/paradigm-prefetch.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupStaleContentCaches } from './stale-cache-cleanup.ts'

class FakeCacheStorage {
  names = new Set<string>()
  async open(name: string): Promise<void> {
    this.names.add(name)
  }
  async keys(): Promise<string[]> {
    return [...this.names]
  }
  async delete(name: string): Promise<boolean> {
    return this.names.delete(name)
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

describe('cleanupStaleContentCaches', () => {
  it('deletes old paradigms-*/senses-* caches, keeps the current contentVersion', async () => {
    await fakeCaches.open('paradigms-old1')
    await fakeCaches.open('paradigms-old2')
    await fakeCaches.open('paradigms-new')
    await fakeCaches.open('senses-old1')
    await fakeCaches.open('senses-new')

    await cleanupStaleContentCaches('new')

    expect([...fakeCaches.names].sort()).toEqual(['paradigms-new', 'senses-new'])
  })

  it('leaves unrelated cache names untouched', async () => {
    await fakeCaches.open('workbox-precache-v1')
    await fakeCaches.open('paradigms-old')

    await cleanupStaleContentCaches('new')

    expect([...fakeCaches.names]).toEqual(['workbox-precache-v1'])
  })

  it('is a no-op when there is nothing stale', async () => {
    await fakeCaches.open('paradigms-new')
    await fakeCaches.open('senses-new')

    await cleanupStaleContentCaches('new')

    expect([...fakeCaches.names].sort()).toEqual(['paradigms-new', 'senses-new'])
  })

  it('does nothing when Cache Storage is unavailable (e.g. jsdom without the API)', async () => {
    vi.unstubAllGlobals()
    await expect(cleanupStaleContentCaches('new')).resolves.toBeUndefined()
  })
})
