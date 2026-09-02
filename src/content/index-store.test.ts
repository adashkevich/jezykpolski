import { describe, expect, it } from 'vitest'
import {
  __resetIndexStoreForTest,
  buildIndexStore,
  getIndexStore,
  initIndexStore,
  normalizeSearchText,
} from './index-store.ts'
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

describe('normalizeSearchText', () => {
  it('strips the seven combining-diacritic Polish letters (ą ć ę ł ń ó ś ź) to their base letter', () => {
    expect(normalizeSearchText('żółty')).toBe('zolty')
    expect(normalizeSearchText('część')).toBe('czesc')
    expect(normalizeSearchText('Łódź')).toBe('lodz')
  })

  it('lowercases', () => {
    expect(normalizeSearchText('CZŁOWIEK')).toBe('czlowiek')
  })

  it('leaves plain Cyrillic untouched other than lowercasing', () => {
    expect(normalizeSearchText('Человек')).toBe('человек')
  })
})

describe('buildIndexStore', () => {
  const rows: WordIndexEntry[] = [
    entry({ lemma: 'zebra', rank: 1, pos: 'NOUN' }),
    entry({ lemma: 'auto', rank: 2, pos: 'NOUN' }),
    entry({ lemma: 'ąbak', rank: 3, pos: 'NOUN' }),
    entry({ lemma: 'żółty', rank: 4, pos: 'ADJ', primaryRu: 'жёлтый', level: 'A1' }),
    entry({ lemma: 'człowiek', rank: 5, pos: 'NOUN', primaryRu: 'человек', level: 'A1' }),
    entry({ lemma: 'mówić', rank: 6, pos: 'VERB', level: 'B1' }),
  ]

  it('byId is keyed by "<lemma>|<POS>"', () => {
    const index = buildIndexStore(rows)
    expect(index.byId.get('zebra|NOUN')?.rank).toBe(1)
    expect(index.byId.get('mówić|VERB')?.rank).toBe(6)
    expect(index.byId.get('nope|NOUN')).toBeUndefined()
  })

  it('byRank is the input array as-is (already rank-sorted by the pipeline)', () => {
    const index = buildIndexStore(rows)
    expect(index.byRank.map((e) => e.lemma)).toEqual([
      'zebra',
      'auto',
      'ąbak',
      'żółty',
      'człowiek',
      'mówić',
    ])
  })

  it('byPos groups entries by part of speech', () => {
    const index = buildIndexStore(rows)
    expect(index.byPos.get('VERB')?.map((e) => e.lemma)).toEqual(['mówić'])
    expect(index.byPos.get('ADJ')?.map((e) => e.lemma)).toEqual(['żółty'])
    expect(index.byPos.get('NOUN')?.map((e) => e.lemma)).toEqual([
      'zebra',
      'auto',
      'ąbak',
      'człowiek',
    ])
  })

  it('byAlpha uses Intl.Collator(\'pl\') so "ą" sorts right after "a", not after "z" (acceptance)', () => {
    const index = buildIndexStore(rows)
    const order = index.byAlpha.map((e) => e.lemma)
    const autoIdx = order.indexOf('auto')
    const abakIdx = order.indexOf('ąbak')
    const zebraIdx = order.indexOf('zebra')
    // "auto" < "ąbak" < "zebra" — ą sits between a and b, nowhere near the end of the
    // alphabet the way a naive (non-'pl') sort would place it.
    expect(autoIdx).toBeLessThan(abakIdx)
    expect(abakIdx).toBeLessThan(zebraIdx)
  })

  it('byAlpha differs from a naive default Array.sort() for the same data (proves the collator is actually doing something)', () => {
    const index = buildIndexStore(rows)
    const collated = index.byAlpha.map((e) => e.lemma)
    const naive = [...rows].map((e) => e.lemma).sort()
    expect(collated).not.toEqual(naive)
    // The naive sort is exactly the failure mode the task warns about: ą ends up after z.
    expect(naive.indexOf('ąbak')).toBeGreaterThan(naive.indexOf('zebra'))
  })

  it('searchTokens are precomputed per word (diacritics stripped, lowercased)', () => {
    const index = buildIndexStore(rows)
    expect(index.searchTokens.get('żółty|ADJ')).toEqual({ lemma: 'zolty', ru: 'желтыи' })
    expect(index.searchTokens.get('człowiek|NOUN')).toEqual({
      lemma: 'czlowiek',
      ru: 'человек',
    })
  })
})

describe('singleton (initIndexStore / getIndexStore)', () => {
  it('getIndexStore throws before initIndexStore has run', () => {
    __resetIndexStoreForTest()
    expect(() => getIndexStore()).toThrow()
  })

  it('getIndexStore returns what initIndexStore built', () => {
    __resetIndexStoreForTest()
    const rows: WordIndexEntry[] = [entry({ lemma: 'test', rank: 1 })]
    const built = initIndexStore(rows)
    expect(getIndexStore()).toBe(built)
    expect(getIndexStore().byId.get('test|NOUN')?.rank).toBe(1)
  })
})
