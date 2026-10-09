import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLoaderCachesForTest } from './loader.ts'
import { __resetIndexStoreForTest, initIndexStore } from './index-store.ts'
import { getAllTranslations, getPrimaryTranslation, getSenseDetails, getSenses } from './senses.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: 0,
    levels: uniformLevels(overrides.level ?? 'A1'),
    ...overrides,
  }
}

function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

beforeEach(() => {
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getPrimaryTranslation', () => {
  it('reads straight from the index, without any fetch', () => {
    initIndexStore([
      entry({ lemma: 'kobieta', pos: 'NOUN', rank: 95, primaryRu: 'женщина', sensesShard: 10 }),
    ])
    vi.stubGlobal('fetch', makeFetchMock({}))
    expect(getPrimaryTranslation('kobieta|NOUN')).toBe('женщина')
  })

  it('throws for an unknown wordId', () => {
    initIndexStore([])
    expect(() => getPrimaryTranslation('nope|NOUN')).toThrow()
  })
})

describe('getSenses / getAllTranslations', () => {
  const shard = {
    'stary|ADJ': [
      { id: 'stary:old', ru: ['старый'], lv: [1, 1, 1], primary: true },
      { id: 'stary:ancient', ru: ['старинный', 'старый'], lv: [3, 3, 2], primary: false },
    ],
  }

  it('getSenses fetches the right shard and returns every sense, primary first', async () => {
    initIndexStore([entry({ lemma: 'stary', pos: 'ADJ', rank: 200, sensesShard: 3 })])
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/003.json': shard }))
    const senses = await getSenses('stary|ADJ')
    expect(senses).toHaveLength(2)
    expect(senses[0]).toEqual({
      id: 'stary:old',
      ru: ['старый'],
      levels: { ru: 'A1', by: 'A1', ua: 'A1' },
      primary: true,
    })
    expect(senses[1]?.levels).toEqual({ ru: 'B1', by: 'B1', ua: 'A2' })
  })

  it('getAllTranslations de-duplicates across senses, primary sense first', async () => {
    initIndexStore([entry({ lemma: 'stary', pos: 'ADJ', rank: 200, sensesShard: 3 })])
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/003.json': shard }))
    const translations = await getAllTranslations('stary|ADJ')
    expect(translations).toEqual(['старый', 'старинный'])
  })

  it('getSenses returns [] for a word missing from its shard rather than throwing', async () => {
    initIndexStore([entry({ lemma: 'ghost', pos: 'NOUN', rank: 1, sensesShard: 3 })])
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/003.json': {} }))
    expect(await getSenses('ghost|NOUN')).toEqual([])
  })
})

describe('getSenseDetails', () => {
  const senses = {
    'być|VERB': [
      { id: 'być:copula', ru: ['быть'], lv: [1, 1, 1], primary: true },
      { id: 'być:exist', ru: ['существовать'], lv: [2, 2, 2], primary: false },
    ],
  }
  const details = {
    'być:copula': { gl: 'łącznik', ex: 'Anna jest lekarką.', by: ['быць'], ua: ['бути'] },
    'być:exist': { gl: 'istnieć', ex: 'Czy na Marsie jest życie?', by: ['быць'], ua: ['бути'] },
    // Another word in the same shard — must not leak into być's map.
    'bóbr:beaver': { gl: 'zwierzę', ex: 'Bóbr buduje tamę.', by: ['бабёр'], ua: ['бобер'] },
  }

  it("loads the word's sense-details shard (same number as its senses shard), keyed by sense id", async () => {
    initIndexStore([entry({ lemma: 'być', pos: 'VERB', rank: 1, sensesShard: 9 })])
    const fetchMock = makeFetchMock({
      'senses/009.json': senses,
      'sense-details/009.json': details,
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await getSenseDetails('być|VERB')
    expect([...result.keys()]).toEqual(['być:copula', 'być:exist'])
    expect(result.get('być:copula')).toEqual({
      gloss: 'łącznik',
      example: 'Anna jest lekarką.',
      by: ['быць'],
      ua: ['бути'],
    })
  })

  it('rejects when the details shard cannot be fetched; getSenses still works', async () => {
    initIndexStore([entry({ lemma: 'być', pos: 'VERB', rank: 1, sensesShard: 9 })])
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/009.json': senses }))
    await expect(getSenseDetails('być|VERB')).rejects.toThrow(/sense-details\/009\.json/)
    expect(await getSenses('być|VERB')).toHaveLength(2)
  })
})
