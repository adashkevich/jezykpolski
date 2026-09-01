import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLoaderCachesForTest, loadParadigmShard } from './loader.ts'
import { __resetIndexStoreForTest, initIndexStore } from './index-store.ts'
import { buildAdjTable, buildNounTable, buildVerbTable, getFormsForSlot, getParadigm } from './paradigms.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { decodeForm } from './codec.ts'
import type { EncodedForm } from './codec.ts'
import type { Paradigm } from '@/types/content.ts'

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

// The real `kobieta|NOUN` entry (public/content/paradigms/042.json) — verified Polish
// declension: N kobieta / G kobiety / D kobiecie / A kobietę / I kobietą / L kobiecie /
// V kobieto (singular), N/A/V kobiety, G kobiet, D kobietom, I kobietami, L kobietach
// (plural).
const KOBIETA_RAW_FORMS: EncodedForm[] = [
  ['kobiety', 2, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobietom', 2, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiet', 2, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietami', 2, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobietach', 2, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 7, 1, 0, 0, 0, 0, 0, 0],
  ['kobietę', 1, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 1, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietą', 1, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobieta', 1, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobieto', 1, 7, 1, 0, 0, 0, 0, 0, 0],
]

const kobietaParadigm: Paradigm = {
  forms: KOBIETA_RAW_FORMS.map(decodeForm),
  dominantGender: 'feminine',
}

describe('getFormsForSlot', () => {
  it('returns the singular genitive form for kobieta', () => {
    expect(getFormsForSlot(kobietaParadigm, 'noun:sg:genitive')).toEqual(['kobiety'])
  })

  it('returns the plural instrumental form', () => {
    expect(getFormsForSlot(kobietaParadigm, 'noun:pl:instrumental')).toEqual(['kobietami'])
  })

  it('de-duplicates identical forms occupying the same slot', () => {
    // kobieta's plural nominative and vocative are both "kobiety" but on different slots —
    // querying the nominative slot alone must not somehow pull in duplicates from elsewhere.
    expect(getFormsForSlot(kobietaParadigm, 'noun:pl:nominative')).toEqual(['kobiety'])
  })

  it('returns an empty array for a slot the paradigm has no form for', () => {
    expect(getFormsForSlot(kobietaParadigm, 'verb:present:1:sg')).toEqual([])
  })
})

describe('buildNounTable (acceptance: kobieta -> 7 cases x 2 numbers, correct forms)', () => {
  it('produces exactly 7 rows, one per case, in CASE_DISPLAY_ORDER', () => {
    const table = buildNounTable(kobietaParadigm)
    expect(table.rows).toHaveLength(7)
    expect(table.rows.map((r) => r.case)).toEqual([
      'nominative',
      'genitive',
      'dative',
      'accusative',
      'instrumental',
      'locative',
      'vocative',
    ])
  })

  it('every row has both a singular and a plural form, and the forms are the real declension', () => {
    const table = buildNounTable(kobietaParadigm)
    const byCase = Object.fromEntries(table.rows.map((r) => [r.case, r]))
    expect(byCase.nominative).toEqual({ case: 'nominative', singular: ['kobieta'], plural: ['kobiety'] })
    expect(byCase.genitive).toEqual({ case: 'genitive', singular: ['kobiety'], plural: ['kobiet'] })
    expect(byCase.dative).toEqual({ case: 'dative', singular: ['kobiecie'], plural: ['kobietom'] })
    expect(byCase.accusative).toEqual({
      case: 'accusative',
      singular: ['kobietę'],
      plural: ['kobiety'],
    })
    expect(byCase.instrumental).toEqual({
      case: 'instrumental',
      singular: ['kobietą'],
      plural: ['kobietami'],
    })
    expect(byCase.locative).toEqual({ case: 'locative', singular: ['kobiecie'], plural: ['kobietach'] })
    expect(byCase.vocative).toEqual({ case: 'vocative', singular: ['kobieto'], plural: ['kobiety'] })
  })
})

describe('buildVerbTable / buildAdjTable (basic shape sanity — no dedicated acceptance point)', () => {
  it('buildVerbTable returns the four expected sections, empty for a NOUN paradigm', () => {
    const table = buildVerbTable(kobietaParadigm)
    expect(table).toEqual({ present: [], future: [], imperative: [], past: [] })
  })

  it('buildAdjTable returns 7 rows for the requested number, empty forms for a NOUN paradigm', () => {
    const table = buildAdjTable(kobietaParadigm, 'singular')
    expect(table.number).toBe('singular')
    expect(table.rows).toHaveLength(7)
    expect(table.rows.every((r) => Object.keys(r.forms).length === 0)).toBe(true)
  })
})

describe('getParadigm', () => {
  it('returns null (not a throw) for one of the 14 real words with no paradigm (acceptance)', async () => {
    initIndexStore([entry({ lemma: 'powinien', pos: 'VERB', rank: 75, paradigmShard: -1 })])
    vi.stubGlobal('fetch', makeFetchMock({}))
    const result = await getParadigm('powinien|VERB')
    expect(result).toBeNull()
  })

  it('throws for a wordId that is not in the index at all (caller bug, not a data gap)', async () => {
    initIndexStore([])
    await expect(getParadigm('nope|NOUN')).rejects.toThrow()
  })

  it('fetches the right shard and decodes it into a Paradigm', async () => {
    initIndexStore([entry({ lemma: 'kobieta', pos: 'NOUN', rank: 95, paradigmShard: 42 })])
    const shard = { 'kobieta|NOUN': { forms: KOBIETA_RAW_FORMS, dominantGender: 1 } }
    vi.stubGlobal('fetch', makeFetchMock({ 'paradigms/042.json': shard }))
    const result = await getParadigm('kobieta|NOUN')
    expect(result?.forms).toHaveLength(14)
    expect(result?.dominantGender).toBe('feminine')
  })

  it('a repeat getParadigm for a word in an already-loaded shard does not fetch again (acceptance)', async () => {
    initIndexStore([
      entry({ lemma: 'kobieta', pos: 'NOUN', rank: 95, paradigmShard: 42 }),
    ])
    const shard = { 'kobieta|NOUN': { forms: KOBIETA_RAW_FORMS, dominantGender: 1 } }
    const fetchMock = makeFetchMock({ 'paradigms/042.json': shard })
    vi.stubGlobal('fetch', fetchMock)
    await getParadigm('kobieta|NOUN')
    await getParadigm('kobieta|NOUN')
    await loadParadigmShard(42)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
