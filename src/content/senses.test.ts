import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLoaderCachesForTest } from './loader.ts'
import { __resetIndexStoreForTest, initIndexStore } from './index-store.ts'
import { getAllTranslations, getPrimaryTranslation, getSenses } from './senses.ts'
import type { WordIndexEntry } from '@/types/content.ts'

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: 0,
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
      { ru: ['старый'], en: 'aged', primary: true },
      { ru: ['старинный', 'старый'], en: 'ancient', primary: false },
    ],
  }

  it('getSenses fetches the right shard and returns every sense, primary first', async () => {
    initIndexStore([entry({ lemma: 'stary', pos: 'ADJ', rank: 200, sensesShard: 3 })])
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/003.json': shard }))
    const senses = await getSenses('stary|ADJ')
    expect(senses).toHaveLength(2)
    expect(senses[0]).toEqual({ ru: ['старый'], en: 'aged', primary: true })
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
