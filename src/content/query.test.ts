import { describe, expect, it } from 'vitest'
import { buildIndexStore, type ContentIndex } from './index-store.ts'
import { queryWords } from './query.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { WordProgressRecord, WordStatus } from '@/types/progress.ts'
import type { LevelValue, PosValue } from './codec.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'

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

// ---------------------------------------------------------------------------
// A small, hand-built index for the search/normalization acceptance checks.
// ---------------------------------------------------------------------------

const smallIndex = buildIndexStore([
  entry({ lemma: 'żółty', rank: 1, pos: 'ADJ', primaryRu: 'жёлтый', level: 'A1' }),
  entry({ lemma: 'człowiek', rank: 2, pos: 'NOUN', primaryRu: 'человек', level: 'A1' }),
  entry({ lemma: 'kobieta', rank: 3, pos: 'NOUN', primaryRu: 'женщина', level: 'A1' }),
  entry({ lemma: 'mówić', rank: 4, pos: 'VERB', primaryRu: 'говорить', level: 'A2' }),
])

describe('queryWords: search normalization (acceptance)', () => {
  it('a diacritic-free Latin query ("zolty") finds a word spelled with Polish diacritics ("żółty")', () => {
    const result = queryWords({ sort: 'frequency', search: 'zolty' }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['żółty'])
  })

  it('a Cyrillic query ("человек") finds the word via its Russian translation, not the lemma', () => {
    const result = queryWords({ sort: 'frequency', search: 'человек' }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['człowiek'])
  })

  it('search is case-insensitive and matches a substring of the lemma', () => {
    const result = queryWords({ sort: 'frequency', search: 'OBIET' }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['kobieta'])
  })

  it('an empty/undefined search returns everything (no accidental filtering)', () => {
    expect(queryWords({ sort: 'frequency' }, new Map(), smallIndex)).toHaveLength(4)
    expect(queryWords({ sort: 'frequency', search: '' }, new Map(), smallIndex)).toHaveLength(4)
  })
})

describe('queryWords: pos / level filters', () => {
  it('filters by pos', () => {
    const result = queryWords({ sort: 'frequency', pos: ['VERB'] }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['mówić'])
  })

  it('filters by explicit levels (multi-select)', () => {
    const result = queryWords({ sort: 'frequency', levels: ['A2'] }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['mówić'])
  })
})

describe('queryWords: sort', () => {
  it("sort: 'alphabetical' returns the Polish-collated order, not insertion order", () => {
    const result = queryWords({ sort: 'alphabetical' }, new Map(), smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(smallIndex.byAlpha.map((e) => e.lemma))
  })

  it("sort: 'frequency' returns rank order", () => {
    const result = queryWords({ sort: 'frequency' }, new Map(), smallIndex)
    expect(result.map((e) => e.rank)).toEqual([1, 2, 3, 4])
  })
})

describe('queryWords: status filter (requires an externally supplied progress map)', () => {
  it('a word with no progress record is treated as status "new"', () => {
    const result = queryWords({ sort: 'frequency', status: ['new'] }, new Map(), smallIndex)
    expect(result).toHaveLength(4)
  })

  it('filters using the caller-supplied progress map', () => {
    const progress = new Map<WordId, WordProgressRecord>([
      [
        encodeWordId('kobieta', 'NOUN'),
        {
          wordId: encodeWordId('kobieta', 'NOUN'),
          status: 'known',
          vocabMaturity: 0.6,
          morphMaturity: 0.4,
          updatedAt: Date.now(),
        },
      ],
    ])
    const result = queryWords({ sort: 'frequency', status: ['known'] }, progress, smallIndex)
    expect(result.map((e) => e.lemma)).toEqual(['kobieta'])
  })

  it('a new progress Map (even with identical content) invalidates the status-scoped cache — no stale results', () => {
    const wordId = encodeWordId('kobieta', 'NOUN')
    const makeProgress = (status: WordStatus) =>
      new Map<WordId, WordProgressRecord>([
        [wordId, { wordId, status, vocabMaturity: 0, morphMaturity: 0, updatedAt: Date.now() }],
      ])
    const q = { sort: 'frequency' as const, status: ['known' as WordStatus] }
    const first = queryWords(q, makeProgress('known'), smallIndex)
    expect(first.map((e) => e.lemma)).toEqual(['kobieta'])
    const second = queryWords(q, makeProgress('new'), smallIndex)
    expect(second).toEqual([])
  })
})

describe('queryWords: memoization', () => {
  it('the same query + same progress reference returns the identical array instance (cache hit)', () => {
    const progress = new Map<WordId, WordProgressRecord>()
    const q = { sort: 'frequency' as const, pos: ['NOUN' as PosValue] }
    const first = queryWords(q, progress, smallIndex)
    const second = queryWords({ ...q }, progress, smallIndex) // new object, same content
    expect(second).toBe(first)
  })
})

// ---------------------------------------------------------------------------
// Full-scale (7998-word) dataset, matching the real corpus's level distribution exactly —
// verified against the shipped `public/content/index.json` (A1: 386, A2: 1116, B1: 2401,
// B2: 3141, C1: 933, C2: 21; total 7998) — used for the "up to B1" and performance checks.
// ---------------------------------------------------------------------------

const LEVEL_COUNTS: readonly [LevelValue, number][] = [
  ['A1', 386],
  ['A2', 1116],
  ['B1', 2401],
  ['B2', 3141],
  ['C1', 933],
  ['C2', 21],
]

function buildFullScaleIndex(): ContentIndex {
  const rows: WordIndexEntry[] = []
  let rank = 1
  const posCycle: readonly PosValue[] = ['NOUN', 'VERB', 'ADJ', 'ADV']
  for (const [level, count] of LEVEL_COUNTS) {
    for (let i = 0; i < count; i++) {
      rows.push(
        entry({
          lemma: `word${rank}`,
          rank,
          level,
          pos: posCycle[rank % posCycle.length]!,
          primaryRu: `перевод${rank}`,
          sensesShard: rank % 16,
          paradigmShard: rank % 64,
        }),
      )
      rank++
    }
  }
  return buildIndexStore(rows)
}

describe('queryWords: "up to level" filter (acceptance)', () => {
  it('upToLevel: B1 returns exactly A1 + A2 + B1 = 3903 words', () => {
    const index = buildFullScaleIndex()
    const result = queryWords({ sort: 'frequency', upToLevel: 'B1' }, new Map(), index)
    expect(result).toHaveLength(3903)
    expect(result.every((e) => e.level === 'A1' || e.level === 'A2' || e.level === 'B1')).toBe(true)
  })
})

describe('queryWords: performance (acceptance, budget 16ms per call)', () => {
  it('a combined filter query over 7998 words runs comfortably within budget', () => {
    const index = buildFullScaleIndex()
    const queries = [
      { sort: 'frequency' as const, upToLevel: 'B1' as LevelValue, pos: ['NOUN' as PosValue] },
      { sort: 'alphabetical' as const, search: 'word12' },
      { sort: 'level' as const, topN: 2000 as const },
      { sort: 'frequency' as const, levels: ['A1', 'A2'] as LevelValue[], search: 'perevod' },
    ]

    const timings: number[] = []
    for (const q of queries) {
      const start = performance.now()
      queryWords(q, new Map(), index)
      timings.push(performance.now() - start)
    }

    console.log(
      `[perf] queryWords over 7998 words, per-call ms: ${timings.map((t) => t.toFixed(3)).join(', ')}`,
    )
    // Budget is 16ms; a generous margin is asserted here since CI machines vary — the real
    // measured numbers on this machine are logged above for the task report.
    for (const t of timings) {
      expect(t).toBeLessThan(16)
    }
  })
})
