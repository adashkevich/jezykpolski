import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LevelValue } from '../src/content/codec.ts'
import type { RawSenseV2, RawWordV2 } from '../src/content/content.schema.ts'
import {
  assemble,
  buildRenames,
  buildWordsJson,
  run,
  type ChunkInput,
  type Fixups,
} from './assemble-words.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const triple = (level: LevelValue = 'A1') => ({ ru: level, by: level, ua: level })
const CONFIDENCE = { ru: 0.9, by: 0.9, ua: 0.9 }
const NO_FIXUPS: Fixups = { dropWords: [] }

function sense(senseId: string, overrides: Partial<RawSenseV2> = {}): RawSenseV2 {
  return {
    sense_id: senseId,
    translation_ru: ['x'],
    translation_by: ['x'],
    translation_ua: ['x'],
    gloss_pl: 'g',
    example_pl: 'e',
    introduced_at: triple(),
    level_confidence: CONFIDENCE,
    primary: true,
    ...overrides,
  }
}

function word(
  lemma: string,
  pos: RawWordV2['pos'],
  rank: number,
  overrides: Partial<RawWordV2> = {},
): RawWordV2 {
  return {
    lemma,
    pos,
    frequency: { rank, count: 1, per_million: 1, arf: 1, dispersion: 0.5 },
    introduced_at: triple(),
    level_confidence: CONFIDENCE,
    senses: [sense(`${lemma}:main`)],
    morph_lemma: lemma,
    ...overrides,
  }
}

/** Consecutive well-formed chunks: one per group, `range` counted by position. */
function chunksOf(...groups: unknown[][]): ChunkInput[] {
  let start = 1
  return groups.map((words, i) => {
    const range = [start, start + words.length - 1]
    start += words.length
    return {
      file: `words_${String(i + 1).padStart(3, '0')}.json`,
      data: { part: i + 1, range, words },
    }
  })
}

function errorsOf(words: unknown[], fixups: Fixups = NO_FIXUPS): string[] {
  return assemble(chunksOf(words), fixups).errors
}

// ---------------------------------------------------------------------------
// assemble()
// ---------------------------------------------------------------------------

describe('assemble', () => {
  it('returns the words of all chunks sorted by frequency.rank', () => {
    const { words, errors, warnings } = assemble(
      chunksOf([word('b', 'NOUN', 2), word('a', 'NOUN', 1)], [word('c', 'VERB', 3)]),
      NO_FIXUPS,
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(words.map((w) => w.lemma)).toEqual(['a', 'b', 'c'])
  })

  it('fails on a duplicate wordId', () => {
    const errors = errorsOf([
      word('inny', 'ADJ', 17),
      word('inny', 'ADJ', 1619, { senses: [sense('inny:other')] }),
    ])
    expect(errors).toEqual([expect.stringContaining('duplicate wordId inny|ADJ')])
  })

  it('fails on a duplicate sense_id, also between two different words', () => {
    const errors = errorsOf([
      word('prawo', 'NOUN', 105, { senses: [sense('prawo:right')] }),
      word('prawo', 'ADV', 4184, { senses: [sense('prawo:right')] }),
    ])
    expect(errors).toEqual([expect.stringContaining('duplicate sense_id prawo:right')])
  })

  it('fails on a word without a primary sense', () => {
    const errors = errorsOf([word('a', 'NOUN', 1, { senses: [sense('a:x', { primary: false })] })])
    expect(errors).toEqual([expect.stringContaining('expected exactly one primary sense, found 0')])
  })

  it('fails on a word with two primary senses', () => {
    const errors = errorsOf([word('a', 'NOUN', 1, { senses: [sense('a:x'), sense('a:y')] })])
    expect(errors).toEqual([expect.stringContaining('expected exactly one primary sense, found 2')])
  })

  it("fails when the word's introduced_at is later than its earliest sense", () => {
    const errors = errorsOf([
      word('a', 'NOUN', 1, {
        introduced_at: { ru: 'B1', by: 'A1', ua: 'A1' },
        senses: [sense('a:x', { introduced_at: triple('A2') })],
      }),
    ])
    expect(errors).toEqual([
      expect.stringContaining('introduced_at.ru is B1, but its earliest sense is A2'),
      expect.stringContaining('introduced_at.by is A1, but its earliest sense is A2'),
      expect.stringContaining('introduced_at.ua is A1, but its earliest sense is A2'),
    ])
  })

  it("fails when the word's introduced_at is earlier than all of its senses", () => {
    const errors = errorsOf([
      word('a', 'NOUN', 1, {
        introduced_at: triple('A1'),
        senses: [sense('a:x', { introduced_at: triple('B1') })],
      }),
    ])
    expect(errors).toHaveLength(3)
    expect(errors[0]).toContain('introduced_at.ru is A1, but its earliest sense is B1')
  })

  it('takes the minimum per profile, not across profiles', () => {
    const errors = errorsOf([
      word('a', 'NOUN', 1, {
        introduced_at: { ru: 'B1', by: 'A2', ua: 'A1' },
        senses: [
          sense('a:x', { introduced_at: { ru: 'B1', by: 'A2', ua: 'B2' } }),
          sense('a:y', { primary: false, introduced_at: { ru: 'C1', by: 'B1', ua: 'A1' } }),
        ],
      }),
    ])
    expect(errors).toEqual([])
  })

  it('fails on a leftover gloss_en', () => {
    const withGlossEn = { ...sense('a:x'), gloss_en: 'to be' }
    const errors = errorsOf([word('a', 'NOUN', 1, { senses: [withGlossEn] })])
    expect(errors).toEqual([expect.stringContaining('gloss_en must be replaced by gloss_pl')])
  })

  it('fails on empty translations, gloss_pl and example_pl', () => {
    const errors = errorsOf([
      word('a', 'NOUN', 1, {
        senses: [
          sense('a:x', { translation_by: [], translation_ua: [''], gloss_pl: '', example_pl: '' }),
        ],
      }),
    ])
    const text = errors.join('\n')
    for (const path of ['translation_by', 'translation_ua', 'gloss_pl', 'example_pl']) {
      expect(text).toContain(`senses.0.${path}`)
    }
  })

  it('fails on a word that does not match the schema, and names it', () => {
    const errors = errorsOf([{ ...word('a', 'NOUN', 1), introduced_at: 'A1' }])
    expect(errors).toEqual([expect.stringMatching(/words_001\.json #0 a\|NOUN: introduced_at/)])
  })

  it('fails on a duplicate frequency.rank', () => {
    const errors = errorsOf([word('a', 'NOUN', 1), word('b', 'NOUN', 1)])
    expect(errors).toEqual([expect.stringContaining('duplicate frequency.rank 1')])
  })

  it('warns, but does not fail, on a sense_id that does not start with the lemma', () => {
    const { errors, warnings } = assemble(
      chunksOf([
        word('spocić się', 'VERB', 1, { senses: [sense('spocić:sweat')] }),
        word('dom', 'NOUN', 2, { senses: [sense('house:building')] }),
      ]),
      NO_FIXUPS,
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([expect.stringContaining('house:building')])
  })

  describe('chunk structure', () => {
    it('fails when parts are not consecutive', () => {
      const chunks = chunksOf([word('a', 'NOUN', 1)], [word('b', 'NOUN', 2)])
      chunks[1] = { file: 'words_003.json', data: { ...(chunks[1]!.data as object), part: 3 } }
      expect(assemble(chunks, NO_FIXUPS).errors).toEqual([
        expect.stringContaining('words_003.json: part is 3, expected 2'),
      ])
    })

    it('fails when ranges overlap', () => {
      const chunks = chunksOf([word('a', 'NOUN', 1)], [word('b', 'NOUN', 2)])
      chunks[1] = {
        file: chunks[1]!.file,
        data: { part: 2, range: [1, 1], words: [word('b', 'NOUN', 2)] },
      }
      expect(assemble(chunks, NO_FIXUPS).errors).toEqual([expect.stringContaining('overlaps')])
    })

    it('fails when the number of words does not match the range', () => {
      const chunks: ChunkInput[] = [
        { file: 'words_001.json', data: { part: 1, range: [1, 3], words: [word('a', 'NOUN', 1)] } },
      ]
      expect(assemble(chunks, NO_FIXUPS).errors).toEqual([
        expect.stringContaining('expects 3 words, has 1'),
      ])
    })

    it('fails on a file that is not a chunk', () => {
      const chunks: ChunkInput[] = [{ file: 'words_001.json', data: [] }]
      expect(assemble(chunks, NO_FIXUPS).errors).toEqual([expect.stringContaining('not a')])
    })
  })

  describe('dropWords', () => {
    const fixups: Fixups = {
      dropWords: [{ rank: 1619, lemma: 'inny', pos: 'ADJ', mergeInto: 'inny|ADJ' }],
    }

    it('drops the duplicate (and its sense_ids) so the invariants hold', () => {
      const duplicates = [
        word('inny', 'ADJ', 17, { senses: [sense('inny:other')] }),
        word('inny', 'ADJ', 1619, { senses: [sense('inny:other')] }),
      ]
      expect(errorsOf(duplicates)).not.toEqual([])

      const result = assemble(chunksOf(duplicates), fixups)
      expect(result.errors).toEqual([])
      expect(result.words.map((w) => w.frequency.rank)).toEqual([17])
      expect(result.dropped.map((d) => [d.word.frequency.rank, d.mergeInto])).toEqual([
        [1619, 'inny|ADJ'],
      ])
    })

    it('fails when the word at that rank is not the one the fixup names', () => {
      const errors = assemble(
        chunksOf([word('inny', 'ADJ', 17), word('x', 'NOUN', 1619)]),
        fixups,
      ).errors
      expect(errors).toEqual([expect.stringContaining('rank 1619 is x|NOUN, expected inny|ADJ')])
    })

    it('fails when the rank is missing', () => {
      const errors = assemble(chunksOf([word('inny', 'ADJ', 17)]), fixups).errors
      expect(errors).toEqual([expect.stringContaining('rank 1619 is missing')])
    })

    it('fails when mergeInto is not a surviving wordId', () => {
      const errors = assemble(
        chunksOf([word('inny', 'NOUN', 17), word('inny', 'ADJ', 1619)]),
        fixups,
      ).errors
      expect(errors).toEqual([expect.stringContaining('inny|ADJ merges into inny|ADJ')])
    })
  })
})

// ---------------------------------------------------------------------------
// buildWordsJson()
// ---------------------------------------------------------------------------

describe('buildWordsJson', () => {
  it('counts words, senses and the ru level of each primary sense', () => {
    const words = [
      word('a', 'NOUN', 1, {
        senses: [sense('a:x', { introduced_at: triple('A1') }), sense('a:y', { primary: false })],
      }),
      word('b', 'NOUN', 2, {
        senses: [sense('b:x', { introduced_at: { ru: 'B2', by: 'A1', ua: 'A1' } })],
      }),
    ]
    const json = buildWordsJson(words, '2026-01-02T03:04:05.000Z')
    expect(json).toMatchObject({
      schema_version: 2,
      generated_at: '2026-01-02T03:04:05.000Z',
      source: 'words_parts/output',
      counts: { total: 2, senses: 3, A1: 1, A2: 0, B1: 0, B2: 1, C1: 0, C2: 0 },
    })
    expect(json.words).toBe(words)
  })
})

// ---------------------------------------------------------------------------
// buildRenames()
// ---------------------------------------------------------------------------

describe('buildRenames', () => {
  const previous = [
    { lemma: 'to', pos: 'NOUN', frequency: { rank: 3 } },
    { lemma: 'dom', pos: 'NOUN', frequency: { rank: 2 } },
    { lemma: 'inny', pos: 'ADJ', frequency: { rank: 1 } },
    { lemma: 'inny', pos: 'NOUN', frequency: { rank: 4 } },
  ]
  const kept = [word('inny', 'ADJ', 1), word('dom', 'NOUN', 2), word('to', 'PRON', 3)]
  const dropped = [{ word: word('inny', 'ADJ', 4), mergeInto: 'inny|ADJ' }]

  it('maps old wordIds to new ones by rank, a dropped duplicate to its mergeInto', () => {
    const { renames, errors } = buildRenames(previous, { words: kept, dropped })
    expect(errors).toEqual([])
    expect(renames).toEqual({ 'to|NOUN': 'to|PRON', 'inny|NOUN': 'inny|ADJ' })
  })

  it('fails when an old word has no counterpart', () => {
    const { errors } = buildRenames(previous, { words: kept.slice(1), dropped })
    expect(errors).toContainEqual(expect.stringContaining('inny|ADJ (rank 1) has no counterpart'))
  })

  it('fails when an old wordId is also a new one (the map would be ambiguous)', () => {
    const swapped = [
      { lemma: 'a', pos: 'NOUN', frequency: { rank: 1 } },
      { lemma: 'b', pos: 'NOUN', frequency: { rank: 2 } },
    ]
    const { errors } = buildRenames(swapped, {
      words: [word('b', 'NOUN', 1), word('c', 'NOUN', 2)],
      dropped: [],
    })
    expect(errors).toEqual([expect.stringContaining('b|NOUN is also a new wordId')])
  })
})

// ---------------------------------------------------------------------------
// run(): files and exit code
// ---------------------------------------------------------------------------

describe('run', () => {
  let dir: string

  const readJson = (name: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(dir, name), 'utf8'))

  function writeChunk(n: number, range: [number, number], words: unknown[], mtime?: number): void {
    const file = join(dir, 'words_parts', 'output', `words_${String(n).padStart(3, '0')}.json`)
    writeFileSync(file, JSON.stringify({ part: n, range, words }, null, 2))
    if (mtime !== undefined) utimesSync(file, mtime, mtime)
  }

  /** A tiny v1 dictionary + two chunks that rename `to|NOUN` and merge `inny|NOUN`. */
  function seed(): void {
    mkdirSync(join(dir, 'words_parts', 'output'), { recursive: true })
    writeFileSync(
      join(dir, 'words-fixups.json'),
      JSON.stringify({
        dropWords: [{ rank: 3, lemma: 'inny', pos: 'ADJ', mergeInto: 'inny|ADJ' }],
      }),
    )
    writeFileSync(join(dir, 'inflections.json'), '{}')
    writeFileSync(
      join(dir, 'words.json'),
      JSON.stringify({
        schema_version: 1,
        words: [
          { lemma: 'inny', pos: 'ADJ', frequency: { rank: 1 } },
          { lemma: 'to', pos: 'NOUN', frequency: { rank: 2 } },
          { lemma: 'inny', pos: 'NOUN', frequency: { rank: 3 } },
        ],
      }),
    )
    writeChunk(1, [1, 2], [word('inny', 'ADJ', 1), word('to', 'PRON', 2)], 1_700_000_000)
    writeChunk(
      2,
      [3, 3],
      [word('inny', 'ADJ', 3, { senses: [sense('inny:other')] })],
      1_700_000_100,
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'assemble-words-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes words.json (generated_at = newest chunk mtime) and the rename map on the first run', () => {
    expect(run(dir)).toBe(0)
    const json = readJson('words.json') as { schema_version: number; generated_at: string }
    expect(json.schema_version).toBe(2)
    expect(json.generated_at).toBe(new Date(1_700_000_100_000).toISOString())
    expect(readJson('word-id-renames.json')).toEqual({
      // sha256('{"schema_version":1,...}' ++ '{}'), whatever it is, is 12 hex characters.
      fromContent: expect.stringMatching(/^[0-9a-f]{12}$/),
      renames: { 'to|NOUN': 'to|PRON', 'inny|NOUN': 'inny|ADJ' },
    })
  })

  it('is byte-identical on a re-run and leaves the rename map alone once words.json is v2', () => {
    expect(run(dir)).toBe(0)
    const first = readFileSync(join(dir, 'words.json'))
    writeFileSync(join(dir, 'word-id-renames.json'), '{"keep":"me"}')

    expect(run(dir)).toBe(0)
    expect(readFileSync(join(dir, 'words.json')).equals(first)).toBe(true)
    expect(readFileSync(join(dir, 'word-id-renames.json'), 'utf8')).toBe('{"keep":"me"}')
  })

  it('exits non-zero and writes nothing when an invariant is broken', () => {
    const before = readFileSync(join(dir, 'words.json'))
    // Two primaries on the first word.
    writeChunk(
      1,
      [1, 2],
      [
        word('inny', 'ADJ', 1, { senses: [sense('inny:a'), sense('inny:b')] }),
        word('to', 'PRON', 2),
      ],
    )
    expect(run(dir)).toBe(1)
    expect(readFileSync(join(dir, 'words.json')).equals(before)).toBe(true)
    expect(existsSync(join(dir, 'word-id-renames.json'))).toBe(false)
  })

  it('exits non-zero when a rename cannot be built', () => {
    // The new dictionary lost rank 2, so the old `to|NOUN` has nowhere to go.
    writeChunk(1, [1, 1], [word('inny', 'ADJ', 1)])
    expect(run(dir)).toBe(1)
    expect(existsSync(join(dir, 'word-id-renames.json'))).toBe(false)
  })

  it('exits non-zero without chunks', () => {
    rmSync(join(dir, 'words_parts', 'output'), { recursive: true })
    mkdirSync(join(dir, 'words_parts', 'output'))
    expect(run(dir)).toBe(1)
  })
})
