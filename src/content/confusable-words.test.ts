import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, getIndexStore, initIndexStore } from './index-store.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { CONFUSABLE_GROUPS } from './confusable-words.ts'

/**
 * Verifies `CONFUSABLE_GROUPS` against a hand-copied real-data fixture — same convention
 * `learning/exercises/distractors.test.ts` already uses for pinning against the real
 * `public/content/index.json` (that file's own header explains why: this package's
 * `tsconfig.app.json` has no Node ambients, so a live `node:fs` read inside a `src/**` test
 * would break `tsc -b`). The fixture below intentionally mirrors the ONE real gap this
 * file's own header documents — `uczyć` exists, `uczyć się` does not — so this test also
 * doubles as a regression guard: if `CONFUSABLE_GROUPS` is ever hand-edited to add that pair
 * back in without actually checking the corpus, this test catches it.
 */
function entry(overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

// Every lemma the 10 *candidate* groups name, mirroring exactly which ones the real corpus
// resolves (see `confusable-words.ts`'s resolution log) — `uczyć się|VERB` is deliberately
// NOT in this fixture (it doesn't exist in the real corpus either); `uczyć|VERB` is present
// only to prove its existence doesn't cause `uczyć się` to resolve by accident.
const REAL_VERBS = [
  'wiedzieć',
  'znać',
  'myśleć',
  'rozumieć',
  'mówić',
  'rozmawiać',
  'widzieć',
  'patrzeć',
  'słyszeć',
  'słuchać',
  'uczyć',
  'studiować',
  'chcieć',
  'lubić',
]
const REAL_ADJS = ['duży', 'wielki', 'mały', 'niewielki', 'ładny', 'piękny']

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([
    ...REAL_VERBS.map((lemma) => entry({ lemma, pos: 'VERB' })),
    ...REAL_ADJS.map((lemma) => entry({ lemma, pos: 'ADJ' })),
  ])
})

describe('CONFUSABLE_GROUPS', () => {
  it('has exactly 9 groups (10 candidates minus the one unresolved lemma)', () => {
    expect(CONFUSABLE_GROUPS).toHaveLength(9)
  })

  it('every group has at least 2 members', () => {
    for (const group of CONFUSABLE_GROUPS) {
      expect(group.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('excludes the uczyć się / studiować group (uczyć się does not resolve in the real corpus)', () => {
    const flatContainsUczycSie = CONFUSABLE_GROUPS.some((group) => group.includes('uczyć się'))
    expect(flatContainsUczycSie).toBe(false)
  })

  it('every remaining lemma resolves to a real WordId (VERB groups)', () => {
    const verbGroups = CONFUSABLE_GROUPS.slice(0, 5) // wiedzieć/znać .. słyszeć/słuchać
    for (const group of verbGroups) {
      for (const lemma of group) {
        const wordId = encodeWordId(lemma, 'VERB')
        expect(getIndexStore().byId.get(wordId), `expected "${wordId}" to resolve`).toBeDefined()
      }
    }
    // chcieć/lubić is group index 5 after the uczyć się exclusion.
    for (const lemma of CONFUSABLE_GROUPS[5]!) {
      const wordId = encodeWordId(lemma, 'VERB')
      expect(getIndexStore().byId.get(wordId)).toBeDefined()
    }
  })

  it('every remaining lemma resolves to a real WordId (ADJ groups)', () => {
    const adjGroups = CONFUSABLE_GROUPS.slice(6)
    expect(adjGroups).toHaveLength(3)
    for (const group of adjGroups) {
      for (const lemma of group) {
        const wordId = encodeWordId(lemma, 'ADJ')
        expect(getIndexStore().byId.get(wordId), `expected "${wordId}" to resolve`).toBeDefined()
      }
    }
  })
})
