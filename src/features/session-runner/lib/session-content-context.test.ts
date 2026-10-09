/**
 * `SessionContentCache` — the primary-sense example that rides along with `preload`
 * (`spec/tasks/50-word-detail-senses-v2.md` §2): requested in the background, never awaited,
 * `undefined` until it arrives and for good when it can't.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContentCache } from './session-content-context.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'

const BYC = encodeWordId('być', 'VERB')

const BYC_ENTRY: WordIndexEntry = {
  lemma: 'być',
  pos: 'VERB',
  rank: 1,
  level: 'A1',
  levels: uniformLevels('A1'),
  primaryRu: 'быть',
  sensesShard: 14,
  paradigmShard: -1,
}

// Shaped like the real `public/content/senses/014.json` / `sense-details/014.json` entries.
const SENSES = {
  'być|VERB': [
    { id: 'być:copula', ru: ['быть'], lv: [1, 1, 1], primary: true },
    { id: 'być:exist', ru: ['быть'], lv: [1, 1, 1], primary: false },
  ],
}
const DETAILS = {
  'być:copula': { gl: 'łączyć podmiot', ex: 'Anna jest lekarką.', by: ['быць'], ua: ['бути'] },
  'być:exist': { gl: 'istnieć', ex: 'Czy na Marsie jest życie?', by: ['быць'], ua: ['бути'] },
}

function json(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

/** A fetch stub where `sense-details` is whatever `details()` returns for each request. */
function stubFetch(details: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: unknown) => {
    const href = String(url)
    if (href.includes('sense-details/')) return details()
    if (href.includes('senses/')) return json(SENSES)
    return { ok: false, status: 404, json: async () => ({}) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
  initIndexStore([BYC_ENTRY])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SessionContentCache — primary-sense example', () => {
  it('preload resolves while the details shard is still in flight; the example shows up once it lands', async () => {
    let deliver!: (response: Response) => void
    stubFetch(() => new Promise<Response>((resolve) => (deliver = resolve)))
    const cache = new SessionContentCache()

    await cache.preload(BYC) // would hang here if it waited for the details shard

    expect(cache.toContentContext().getAllTranslations(BYC)).toEqual(['быть'])
    expect(cache.getPrimaryExample(BYC)).toBeUndefined()

    deliver(json(DETAILS))
    await vi.waitFor(() => expect(cache.getPrimaryExample(BYC)).toBe('Anna jest lekarką.'))
  })

  it('a failing details shard (offline, never cached) is swallowed: preload is fine, no example', async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const cache = new SessionContentCache()

    await expect(cache.preload(BYC)).resolves.toBeUndefined()
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('sense-details/'))).toBe(
        true,
      ),
    )
    expect(cache.getPrimaryExample(BYC)).toBeUndefined()
  })

  it('asks for the example once per word, however many times the word is preloaded', async () => {
    const fetchMock = stubFetch(async () => json(DETAILS))
    const cache = new SessionContentCache()

    await cache.preload(BYC)
    await cache.preload(BYC)
    await vi.waitFor(() => expect(cache.getPrimaryExample(BYC)).toBe('Anna jest lekarką.'))

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('sense-details/')),
    ).toHaveLength(1)
  })
})
