import { describe, expect, it, vi } from 'vitest'
import {
  __resetIndexStoreForTest,
  buildIndexStore,
  getIndexStore,
  getIndexStoreLangs,
  initIndexStore,
  normalizeSearchText,
  setIndexStoreLangs,
  subscribeIndexStore,
} from './index-store.ts'
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

// ---------------------------------------------------------------------------
// Task 51 (`spec/tasks/51-language-profile.md` §2): `level` is the active profile's level.
// ---------------------------------------------------------------------------

/** Real rows of `public/content/index.json` whose levels differ between profiles:
 *  `uśmiech|NOUN` is A2 for `ru` but A1 for `by`/`ua`; `radzić|VERB` is B1 for `ru`, A2 for
 *  `by`/`ua`. `być|VERB` is A1 everywhere. `level` is `levels.ru`, as the loader decodes it. */
const PROFILE_ROWS: WordIndexEntry[] = [
  entry({ lemma: 'być', rank: 3, pos: 'VERB', primaryRu: 'быть', level: 'A1' }),
  entry({
    lemma: 'uśmiech',
    rank: 1008,
    primaryRu: 'улыбка',
    level: 'A2',
    levels: { ru: 'A2', by: 'A1', ua: 'A1' },
  }),
  entry({
    lemma: 'radzić',
    rank: 1016,
    pos: 'VERB',
    primaryRu: 'советовать',
    level: 'B1',
    levels: { ru: 'B1', by: 'A2', ua: 'A2' },
  }),
]

describe('buildIndexStore — known languages (task 51, 52)', () => {
  it('Russian only (the default): level is levels.ru, rows and byRank are the input as-is', () => {
    const index = buildIndexStore(PROFILE_ROWS)
    expect(index.byId.get('uśmiech|NOUN')?.level).toBe('A2')
    expect(index.byRank).toBe(PROFILE_ROWS)
    expect(index.byId.get('uśmiech|NOUN')).toBe(PROFILE_ROWS[1])
    expect(index.byLevel.map((e) => e.lemma)).toEqual(['być', 'uśmiech', 'radzić'])
  })

  it('ru + ua: level comes from levels.ua — byLevel, byId and byPos all carry it', () => {
    const index = buildIndexStore(PROFILE_ROWS, ['ru', 'ua'])
    expect(index.byId.get('uśmiech|NOUN')?.level).toBe('A1')
    expect(index.byId.get('radzić|VERB')?.level).toBe('A2')
    expect(index.byPos.get('VERB')?.map((e) => e.level)).toEqual(['A1', 'A2'])
    // A1 bucket now holds być and uśmiech (rank order), A2 holds radzić.
    expect(index.byLevel.map((e) => `${e.lemma}:${e.level}`)).toEqual([
      'być:A1',
      'uśmiech:A1',
      'radzić:A2',
    ])
    // Everything else about the entry is untouched; unchanged rows stay the same objects.
    expect(index.byId.get('uśmiech|NOUN')?.levels).toEqual({ ru: 'A2', by: 'A1', ua: 'A1' })
    expect(index.byId.get('być|VERB')).toBe(PROFILE_ROWS[0])
    expect(index.byRank.map((e) => e.lemma)).toEqual(['być', 'uśmiech', 'radzić'])
  })

  it('ru + by: level comes from levels.by', () => {
    const index = buildIndexStore(PROFILE_ROWS, ['ru', 'by'])
    expect(index.byId.get('radzić|VERB')?.level).toBe('A2')
  })

  it('without Russian the other language alone decides: the same levels as with it', () => {
    const index = buildIndexStore(PROFILE_ROWS, ['by'])
    expect(index.byId.get('uśmiech|NOUN')?.level).toBe('A1')
    expect(index.byId.get('radzić|VERB')?.level).toBe('A2')
  })

  it('several languages: the easiest of their columns', () => {
    const rows = [
      entry({
        lemma: 'a',
        rank: 1,
        level: 'B2',
        levels: { ru: 'B2', by: 'B1', ua: 'A2' },
      }),
      entry({
        lemma: 'b',
        rank: 2,
        level: 'B2',
        levels: { ru: 'B2', by: 'A2', ua: 'B1' },
      }),
    ]
    const index = buildIndexStore(rows, ['ru', 'by', 'ua'])
    expect(index.byId.get('a|NOUN')?.level).toBe('A2')
    expect(index.byId.get('b|NOUN')?.level).toBe('A2')
  })
})

describe('singleton — setIndexStoreLangs / subscribeIndexStore (task 51, 52)', () => {
  it('initIndexStore builds for the given languages and remembers them', () => {
    __resetIndexStoreForTest()
    expect(getIndexStoreLangs()).toEqual(['ru'])
    initIndexStore(PROFILE_ROWS, ['ru', 'ua'])
    expect(getIndexStoreLangs()).toEqual(['ru', 'ua'])
    expect(getIndexStore().byId.get('uśmiech|NOUN')?.level).toBe('A1')
  })

  it('switching swaps in a new index object and notifies subscribers; switching back reuses the first one', () => {
    __resetIndexStoreForTest()
    const ru = initIndexStore(PROFILE_ROWS)
    const listener = vi.fn()
    const unsubscribe = subscribeIndexStore(listener)

    const ua = setIndexStoreLangs(['ru', 'ua'])
    expect(ua).not.toBe(ru)
    expect(getIndexStore()).toBe(ua)
    expect(getIndexStoreLangs()).toEqual(['ru', 'ua'])
    expect(getIndexStore().byId.get('radzić|VERB')?.level).toBe('A2')
    expect(listener).toHaveBeenCalledTimes(1)

    expect(setIndexStoreLangs(['ru'])).toBe(ru)
    expect(getIndexStore().byId.get('radzić|VERB')?.level).toBe('B1')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setIndexStoreLangs(['ru', 'by'])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('setting the languages it already has is a no-op: same object, nobody notified', () => {
    __resetIndexStoreForTest()
    const ru = initIndexStore(PROFILE_ROWS)
    const listener = vi.fn()
    const unsubscribe = subscribeIndexStore(listener)

    expect(setIndexStoreLangs(['ru'])).toBe(ru)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('the same set written in another order or with repeats is the same set', () => {
    __resetIndexStoreForTest()
    initIndexStore(PROFILE_ROWS)
    const first = setIndexStoreLangs(['ua', 'ru'])
    const langs = getIndexStoreLangs()
    const listener = vi.fn()
    const unsubscribe = subscribeIndexStore(listener)

    expect(setIndexStoreLangs(['ru', 'ua', 'ua'])).toBe(first)
    expect(listener).not.toHaveBeenCalled()
    // A stable snapshot — `useSyncExternalStore` compares it by identity.
    expect(getIndexStoreLangs()).toBe(langs)
    expect(langs).toEqual(['ru', 'ua'])
    unsubscribe()
  })

  it('an empty list falls back to Russian only', () => {
    __resetIndexStoreForTest()
    const ru = initIndexStore(PROFILE_ROWS, ['ru', 'by'])
    expect(setIndexStoreLangs([])).not.toBe(ru)
    expect(getIndexStoreLangs()).toEqual(['ru'])
  })

  it('throws before initIndexStore, like getIndexStore', () => {
    __resetIndexStoreForTest()
    expect(() => setIndexStoreLangs(['ru', 'ua'])).toThrow()
  })
})
