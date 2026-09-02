import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLoaderCachesForTest, loadParadigmShard } from './loader.ts'
import { __resetIndexStoreForTest, initIndexStore } from './index-store.ts'
import {
  buildAdjTable,
  buildNounTable,
  buildVerbTable,
  getFormsForSlot,
  getParadigm,
} from './paradigms.ts'
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

// The real `robić|VERB` entry (public/content/paradigms/057.json), verified against the
// built content (task 08's decision log records the exact `node -e` inspection): analytic
// imperfective future (`będę robić` etc., `analytic: 1`), synthetic present, imperative, and
// past tense with the full singular (masculine/feminine/neuter) + plural
// (masculine_personal/non_masculine_personal) gender split.
const ROBIC_RAW_FORMS: EncodedForm[] = [
  ['będziemy robić', 2, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziecie robić', 2, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będą robić', 2, 0, 0, 0, 3, 3, 1, 1, 1],
  ['będę robić', 1, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziesz robić', 1, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będzie robić', 1, 0, 0, 0, 3, 3, 1, 1, 1],
  ['robimy', 2, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robicie', 2, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robią', 2, 0, 0, 0, 1, 3, 1, 1, 0],
  ['robię', 1, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robisz', 1, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robi', 1, 0, 0, 0, 1, 3, 1, 1, 0],
  ['róbmy', 2, 0, 0, 0, 0, 1, 2, 1, 0],
  ['róbcie', 2, 0, 0, 0, 0, 2, 2, 1, 0],
  ['rób', 1, 0, 0, 0, 0, 2, 2, 1, 0],
  ['robić', 0, 0, 0, 0, 0, 0, 3, 1, 0],
  ['robiliśmy', 2, 0, 2, 0, 2, 1, 1, 1, 0],
  ['robiłyśmy', 2, 0, 6, 0, 2, 1, 1, 1, 0],
  ['robiliście', 2, 0, 2, 0, 2, 2, 1, 1, 0],
  ['robiłyście', 2, 0, 6, 0, 2, 2, 1, 1, 0],
  ['robili', 2, 0, 2, 0, 2, 3, 1, 1, 0],
  ['robiły', 2, 0, 6, 0, 2, 3, 1, 1, 0],
  ['robiłom', 1, 0, 5, 0, 2, 1, 1, 1, 0],
  ['robiłem', 1, 0, 10, 0, 2, 1, 1, 1, 0],
  ['robiłam', 1, 0, 1, 0, 2, 1, 1, 1, 0],
  ['robiłeś', 1, 0, 10, 0, 2, 2, 1, 1, 0],
  ['robiłaś', 1, 0, 1, 0, 2, 2, 1, 1, 0],
  ['robiłoś', 1, 0, 5, 0, 2, 2, 1, 1, 0],
  ['robił', 1, 0, 10, 0, 2, 3, 1, 1, 0],
  ['robiła', 1, 0, 1, 0, 2, 3, 1, 1, 0],
  ['robiło', 1, 0, 5, 0, 2, 3, 1, 1, 0],
]

const robicParadigm: Paradigm = { forms: ROBIC_RAW_FORMS.map(decodeForm) }

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
    expect(byCase.nominative).toEqual({
      case: 'nominative',
      singular: ['kobieta'],
      plural: ['kobiety'],
    })
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
    expect(byCase.locative).toEqual({
      case: 'locative',
      singular: ['kobiecie'],
      plural: ['kobietach'],
    })
    expect(byCase.vocative).toEqual({
      case: 'vocative',
      singular: ['kobieto'],
      plural: ['kobiety'],
    })
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

describe('buildVerbTable(robić) — task 08 acceptance: present/past/future/imperative, analytic future marked, past has gender variants', () => {
  const table = buildVerbTable(robicParadigm)

  it('present has 6 rows (3 persons x 2 numbers), none analytic', () => {
    expect(table.present).toHaveLength(6)
    expect(table.present.every((r) => r.analytic === false)).toBe(true)
    expect(table.present.find((r) => r.person === 1 && r.number === 'singular')?.forms).toEqual([
      'robię',
    ])
  })

  it('future is the analytic construction, marked analytic: true', () => {
    expect(table.future).toHaveLength(6)
    expect(table.future.every((r) => r.analytic === true)).toBe(true)
    expect(table.future.find((r) => r.person === 1 && r.number === 'singular')?.forms).toEqual([
      'będę robić',
    ])
  })

  it('imperative has the 2nd-person singular and both plural persons, not analytic', () => {
    expect(table.imperative.every((r) => r.analytic === false)).toBe(true)
    expect(table.imperative.find((r) => r.person === 2 && r.number === 'singular')?.forms).toEqual([
      'rób',
    ])
  })

  it('past tense shows the gendered variants (robiłem masc. / robiłam fem.), not analytic', () => {
    const firstSgMasc = table.past.find(
      (r) => r.person === 1 && r.number === 'singular' && r.gender === 'masculine',
    )
    const firstSgFem = table.past.find(
      (r) => r.person === 1 && r.number === 'singular' && r.gender === 'feminine',
    )
    expect(firstSgMasc?.forms).toEqual(['robiłem'])
    expect(firstSgFem?.forms).toEqual(['robiłam'])
    expect(table.past.every((r) => r.analytic === false)).toBe(true)
  })
})

// A trimmed real excerpt of `dobry|ADJ` (public/content/paradigms/006.json`): singular
// nominative for all 3 concrete masculine genders (only "dobry" is actually stored, tagged
// with the bare `masculine` gender code — code 10) plus feminine/neuter nominative, and the
// comparative/superlative citation slot.
const DOBRY_EXCERPT_FORMS: EncodedForm[] = [
  ['dobry', 1, 1, 10, 1, 0, 0, 0, 0, 0], // sg nom, bare masculine, positive
  ['dobra', 1, 1, 1, 1, 0, 0, 0, 0, 0], // sg nom feminine, positive
  ['dobre', 1, 1, 5, 1, 0, 0, 0, 0, 0], // sg nom neuter, positive
  ['lepszy', 1, 1, 10, 2, 0, 0, 0, 0, 0], // sg nom, bare masculine, comparative (citation slot)
  ['najlepszy', 1, 1, 10, 3, 0, 0, 0, 0, 0], // sg nom, bare masculine, superlative (citation slot)
]
const dobryExcerptParadigm: Paradigm = { forms: DOBRY_EXCERPT_FORMS.map(decodeForm) }

describe('buildAdjTable(dobry) — a bare "masculine"-tagged form fills all 3 concrete masculine columns', () => {
  it('the single stored "dobry" appears under masculine_personal/animate/inanimate, not just one', () => {
    const table = buildAdjTable(dobryExcerptParadigm, 'singular')
    const nominativeRow = table.rows.find((r) => r.case === 'nominative')!
    expect(nominativeRow.forms.masculine_personal).toEqual(['dobry'])
    expect(nominativeRow.forms.masculine_animate).toEqual(['dobry'])
    expect(nominativeRow.forms.masculine_inanimate).toEqual(['dobry'])
    expect(nominativeRow.forms.feminine).toEqual(['dobra'])
    expect(nominativeRow.forms.neuter).toEqual(['dobre'])
  })

  it('does not leak into an unrelated case (accusative has no data in this excerpt)', () => {
    const table = buildAdjTable(dobryExcerptParadigm, 'singular')
    const accusativeRow = table.rows.find((r) => r.case === 'accusative')!
    expect(Object.keys(accusativeRow.forms)).toHaveLength(0)
  })

  it('the comparative/superlative citation slot still resolves via the same bare-masculine form', () => {
    expect(getFormsForSlot(dobryExcerptParadigm, 'adj:degree:comparative')).toEqual(['lepszy'])
    expect(getFormsForSlot(dobryExcerptParadigm, 'adj:degree:superlative')).toEqual(['najlepszy'])
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
    initIndexStore([entry({ lemma: 'kobieta', pos: 'NOUN', rank: 95, paradigmShard: 42 })])
    const shard = { 'kobieta|NOUN': { forms: KOBIETA_RAW_FORMS, dominantGender: 1 } }
    const fetchMock = makeFetchMock({ 'paradigms/042.json': shard })
    vi.stubGlobal('fetch', fetchMock)
    await getParadigm('kobieta|NOUN')
    await getParadigm('kobieta|NOUN')
    await loadParadigmShard(42)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
