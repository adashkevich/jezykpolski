import { describe, expect, it } from 'vitest'
import type { LevelValue } from '@/content/codec.ts'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import {
  currentNewWordLevel,
  orderNewWordCandidates,
  practicePoolLevel,
  unlockedLevels,
} from './level-gate.ts'
import type { LevelPoolCounts } from './level-gate.ts'

function counts(overrides?: { unstartedByLevel?: Partial<Record<LevelValue, number>> }): LevelPoolCounts {
  // Default every level to "far from exhausted" (9999 unstarted) unless a test explicitly
  // overrides it — a default of 0 would trivially satisfy "fully started" for every level and
  // cascade the whole dictionary open regardless of what a test is actually exercising.
  const unstartedByLevel = Object.fromEntries(
    LEVEL_VALUES.map((level) => [level, 9999]),
  ) as Record<LevelValue, number>
  return {
    unstartedByLevel: {
      ...unstartedByLevel,
      ...overrides?.unstartedByLevel,
    } as Record<LevelValue, number>,
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
  it('keeps only A1 open while A1 has any unstarted words at all; a C1 word never becomes a candidate at any rank', () => {
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

  it('opens A2 only once A1 has zero unstarted words left, not at one', () => {
    const oneLeft = counts({ unstartedByLevel: { A1: 1 } as Partial<Record<LevelValue, number>> })
    expect(unlockedLevels(oneLeft, 'A1')).toEqual(['A1'])

    const fullyStarted = counts({ unstartedByLevel: { A1: 0 } as Partial<Record<LevelValue, number>> })
    expect(unlockedLevels(fullyStarted, 'A1')).toEqual(['A1', 'A2'])
  })

  it('a word started by hand on a higher level does NOT open it while the level below still has unstarted words (no ratchet)', () => {
    const c = counts({
      unstartedByLevel: { A1: 5000, A2: 9998 } as Partial<Record<LevelValue, number>>, // A2 has 1 started word, still 9998 unstarted
    })
    expect(unlockedLevels(c, 'A1')).toEqual(['A1'])
  })

  it('startLevel = B1 excludes A1/A2 from the output entirely, regardless of their counts', () => {
    const c = counts({ unstartedByLevel: { B1: 5000 } as Partial<Record<LevelValue, number>> })
    expect(unlockedLevels(c, 'B1')).toEqual(['B1'])
    expect(unlockedLevels(c, 'B1')).not.toContain('A1')
    expect(unlockedLevels(c, 'B1')).not.toContain('A2')
  })

  it('cascades through several fully-started levels in one pass', () => {
    const c = counts({
      unstartedByLevel: { A1: 0, A2: 0, B1: 5000 } as Partial<Record<LevelValue, number>>,
    })
    expect(unlockedLevels(c, 'A1')).toEqual(['A1', 'A2', 'B1'])
  })

  it('an exhausted dictionary (every level fully started) unlocks every level from startLevel up', () => {
    const allZero = Object.fromEntries(LEVEL_VALUES.map((level) => [level, 0])) as Record<
      LevelValue,
      number
    >
    const c = counts({ unstartedByLevel: allZero })
    expect(unlockedLevels(c, 'A1')).toEqual([...LEVEL_VALUES])
  })
})

describe('currentNewWordLevel', () => {
  it('is the (only) open level while it still has unstarted words', () => {
    const c = counts({ unstartedByLevel: { A1: 386 } as Partial<Record<LevelValue, number>> })
    expect(currentNewWordLevel(c, 'A1')).toBe('A1')
  })

  it('advances to the next level the instant the previous one hits zero', () => {
    const c = counts({ unstartedByLevel: { A1: 0, A2: 1116 } as Partial<Record<LevelValue, number>> })
    expect(currentNewWordLevel(c, 'A1')).toBe('A2')
  })

  it('is undefined once the whole open range (here: the entire dictionary) is fully started', () => {
    const allZero = Object.fromEntries(LEVEL_VALUES.map((level) => [level, 0])) as Record<
      LevelValue,
      number
    >
    const c = counts({ unstartedByLevel: allZero })
    expect(currentNewWordLevel(c, 'A1')).toBeUndefined()
  })

  it('respects startLevel — never reports a level below it, even if that level has unstarted words', () => {
    const c = counts({
      unstartedByLevel: { A1: 5000, B1: 2401 } as Partial<Record<LevelValue, number>>,
    })
    expect(currentNewWordLevel(c, 'B1')).toBe('B1')
  })
})

describe('practicePoolLevel', () => {
  it('equals currentNewWordLevel while the current level still has unstarted words', () => {
    const c = counts({ unstartedByLevel: { A1: 386 } as Partial<Record<LevelValue, number>> })
    expect(practicePoolLevel(c, 'A1')).toBe('A1')
  })

  it('advances alongside currentNewWordLevel the instant the previous level hits zero', () => {
    const c = counts({ unstartedByLevel: { A1: 0, A2: 1116 } as Partial<Record<LevelValue, number>> })
    expect(practicePoolLevel(c, 'A1')).toBe('A2')
  })

  it('falls back to the highest unlocked level once the whole open range is exhausted — never undefined', () => {
    const allZero = Object.fromEntries(LEVEL_VALUES.map((level) => [level, 0])) as Record<
      LevelValue,
      number
    >
    const c = counts({ unstartedByLevel: allZero })
    expect(practicePoolLevel(c, 'A1')).toBe(LEVEL_VALUES[LEVEL_VALUES.length - 1])
  })

  it('respects startLevel — never reports a level below it', () => {
    const c = counts({ unstartedByLevel: { B1: 2401 } as Partial<Record<LevelValue, number>> })
    expect(practicePoolLevel(c, 'B1')).toBe('B1')
  })
})

describe('orderNewWordCandidates', () => {
  it('sorts all of the lower unlocked level by rank before any of the next level', () => {
    const a1 = [
      entry({ lemma: 'a1-30', rank: 30, level: 'A1' }),
      entry({ lemma: 'a1-10', rank: 10, level: 'A1' }),
      entry({ lemma: 'a1-20', rank: 20, level: 'A1' }),
    ]
    const a2 = [
      entry({ lemma: 'a2-15', rank: 15, level: 'A2' }),
      entry({ lemma: 'a2-5', rank: 5, level: 'A2' }),
    ]
    const ordered = orderNewWordCandidates([...a1, ...a2], ['A1', 'A2'])
    // Every A1 word (by rank) comes before every A2 word (by rank), even though a2-5's raw
    // rank is lower than every A1 word's — task 38's strict progression means level always
    // wins over rank, unlike the old 2:1 interleave.
    expect(ordered.map((w) => w.lemma)).toEqual(['a1-10', 'a1-20', 'a1-30', 'a2-5', 'a2-15'])
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
