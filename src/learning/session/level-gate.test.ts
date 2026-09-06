import { describe, expect, it } from 'vitest'
import type { LevelValue } from '@/content/codec.ts'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { LEVEL_UNLOCK_REMAINING, orderNewWordCandidates, unlockedLevels } from './level-gate.ts'
import type { LevelPoolCounts } from './level-gate.ts'

function counts(overrides?: {
  unstartedByLevel?: Partial<Record<LevelValue, number>>
  startedByLevel?: Partial<Record<LevelValue, boolean>>
}): LevelPoolCounts {
  // Default every level to "far from exhausted" (9999 unstarted) unless a test explicitly
  // overrides it — a default of 0 would trivially satisfy "almost done" for every level and
  // cascade the whole dictionary open regardless of what a test is actually exercising.
  const unstartedByLevel = Object.fromEntries(
    LEVEL_VALUES.map((level) => [level, 9999]),
  ) as Record<LevelValue, number>
  const startedByLevel = Object.fromEntries(
    LEVEL_VALUES.map((level) => [level, false]),
  ) as Record<LevelValue, boolean>
  return {
    unstartedByLevel: {
      ...unstartedByLevel,
      ...overrides?.unstartedByLevel,
    } as Record<LevelValue, number>,
    startedByLevel: {
      ...startedByLevel,
      ...overrides?.startedByLevel,
    } as Record<LevelValue, boolean>,
  }
}

function entry(overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: -1,
    ...overrides,
  }
}

describe('unlockedLevels', () => {
  it('keeps only A1 open while A1 is far from exhausted; a C1 word never becomes a candidate at any rank', () => {
    const c = counts({ unstartedByLevel: { A1: 2000 } as Partial<Record<LevelValue, number>> })
    const unlocked = unlockedLevels(c, 'A1')
    expect(unlocked).toEqual(['A1'])

    const candidates = [
      entry({ lemma: 'kot', rank: 1, level: 'A1' }),
      entry({ lemma: 'ponadto', rank: 2, level: 'C1' }), // low rank, high level
    ]
    const ordered = orderNewWordCandidates(candidates, unlocked)
    expect(ordered.map((w) => w.lemma)).toEqual(['kot'])
  })

  it('opens A2 once unstarted A1 drops to exactly LEVEL_UNLOCK_REMAINING, not one above', () => {
    const atThreshold = counts({
      unstartedByLevel: { A1: LEVEL_UNLOCK_REMAINING } as Partial<Record<LevelValue, number>>,
    })
    expect(unlockedLevels(atThreshold, 'A1')).toEqual(['A1', 'A2'])

    const aboveThreshold = counts({
      unstartedByLevel: { A1: LEVEL_UNLOCK_REMAINING + 1 } as Partial<Record<LevelValue, number>>,
    })
    expect(unlockedLevels(aboveThreshold, 'A1')).toEqual(['A1'])
  })

  it('a level with at least one started word stays open (ratchet) even if the level below fills back up', () => {
    const c = counts({
      unstartedByLevel: { A1: 5000 } as Partial<Record<LevelValue, number>>, // A1 "refilled", far from the threshold
      startedByLevel: { A2: true } as Partial<Record<LevelValue, boolean>>,
    })
    expect(unlockedLevels(c, 'A1')).toEqual(['A1', 'A2'])
  })

  it('startLevel = B1 excludes A1/A2 from the output entirely, regardless of their counts', () => {
    const c = counts({ unstartedByLevel: { B1: 5000 } as Partial<Record<LevelValue, number>> })
    expect(unlockedLevels(c, 'B1')).toEqual(['B1'])
    expect(unlockedLevels(c, 'B1')).not.toContain('A1')
    expect(unlockedLevels(c, 'B1')).not.toContain('A2')
  })

  it('cascades through several empty/started levels in one pass (a whole level below the threshold is never a dead end)', () => {
    const c = counts({
      unstartedByLevel: { A1: 0, A2: 0, B1: 5000 } as Partial<Record<LevelValue, number>>,
    })
    expect(unlockedLevels(c, 'A1')).toEqual(['A1', 'A2', 'B1'])
  })

  it('an exhausted dictionary (every level at/under the threshold) unlocks every level from startLevel up', () => {
    const allZero = Object.fromEntries(LEVEL_VALUES.map((level) => [level, 0])) as Record<
      LevelValue,
      number
    >
    const c = counts({ unstartedByLevel: allZero })
    expect(unlockedLevels(c, 'A1')).toEqual([...LEVEL_VALUES])
  })
})

describe('orderNewWordCandidates', () => {
  it('mixes two non-empty unlocked levels 2:1 (L0, L0, L1 cycle), sorted by rank within each level', () => {
    const a1 = [
      entry({ lemma: 'a1-30', rank: 30, level: 'A1' }),
      entry({ lemma: 'a1-10', rank: 10, level: 'A1' }),
      entry({ lemma: 'a1-20', rank: 20, level: 'A1' }),
      entry({ lemma: 'a1-40', rank: 40, level: 'A1' }),
    ]
    const a2 = [
      entry({ lemma: 'a2-15', rank: 15, level: 'A2' }),
      entry({ lemma: 'a2-5', rank: 5, level: 'A2' }),
    ]
    const ordered = orderNewWordCandidates([...a1, ...a2], ['A1', 'A2'])
    expect(ordered.map((w) => w.lemma)).toEqual([
      'a1-10',
      'a1-20',
      'a2-5',
      'a1-30',
      'a1-40',
      'a2-15',
    ])
  })

  it('an empty L1 does not break the cycle — every slot goes to L0', () => {
    const a1 = [
      entry({ lemma: 'a1-30', rank: 30, level: 'A1' }),
      entry({ lemma: 'a1-10', rank: 10, level: 'A1' }),
      entry({ lemma: 'a1-20', rank: 20, level: 'A1' }),
    ]
    const ordered = orderNewWordCandidates(a1, ['A1', 'A2'])
    expect(ordered.map((w) => w.lemma)).toEqual(['a1-10', 'a1-20', 'a1-30'])
  })

  it('is pure/deterministic: repeated calls with the same input produce the same output', () => {
    const words = [
      entry({ lemma: 'a1-30', rank: 30, level: 'A1' }),
      entry({ lemma: 'a1-10', rank: 10, level: 'A1' }),
      entry({ lemma: 'a2-5', rank: 5, level: 'A2' }),
    ]
    const first = orderNewWordCandidates(words, ['A1', 'A2'])
    const second = orderNewWordCandidates(words, ['A1', 'A2'])
    expect(first).toEqual(second)
  })

  it('drops candidates whose level is not in the unlocked list', () => {
    const words = [
      entry({ lemma: 'a1-1', rank: 1, level: 'A1' }),
      entry({ lemma: 'b1-2', rank: 2, level: 'B1' }),
    ]
    const ordered = orderNewWordCandidates(words, ['A1'])
    expect(ordered.map((w) => w.lemma)).toEqual(['a1-1'])
  })

  it('returns an empty list when there are no candidates at all', () => {
    expect(orderNewWordCandidates([], ['A1'])).toEqual([])
  })
})
