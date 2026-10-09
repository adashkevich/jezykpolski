import { describe, expect, it } from 'vitest'

import { LEVEL, POS, senseShardIndex } from '../src/content/codec.ts'
import type { LevelTriple, RawSenseV2, RawWordV2 } from '../src/content/content.schema.ts'
import { buildWordArtifacts } from './build-content.ts'

const CONFIDENCE = { ru: 0.9, by: 0.9, ua: 0.9 }

function sense(
  senseId: string,
  levels: LevelTriple,
  overrides: Partial<RawSenseV2> = {},
): RawSenseV2 {
  return {
    sense_id: senseId,
    translation_ru: [`${senseId}-ru`],
    translation_by: [`${senseId}-by`],
    translation_ua: [`${senseId}-ua`],
    gloss_pl: `${senseId}-gloss`,
    example_pl: `${senseId}-example`,
    introduced_at: levels,
    level_confidence: CONFIDENCE,
    primary: false,
    ...overrides,
  }
}

function word(lemma: string, pos: RawWordV2['pos'], senses: RawSenseV2[]): RawWordV2 {
  return {
    lemma,
    pos,
    frequency: { rank: 105, count: 1, per_million: 1, arf: 1, dispersion: 0.5 },
    // The minimum over all senses, as assemble-words guarantees — deliberately NOT what the
    // index uses.
    introduced_at: { ru: 'A1', by: 'A1', ua: 'A1' },
    level_confidence: CONFIDENCE,
    senses,
    morph_lemma: lemma,
  }
}

const A1 = { ru: 'A1', by: 'A1', ua: 'A1' } as const

describe('buildWordArtifacts', () => {
  // The real shape of prawo|NOUN: the word is "A1" thanks to "правая сторона", the primary
  // sense "закон" is A2 (and A1 for a Ukrainian speaker in this fixture).
  const prawo = word('prawo', 'NOUN', [
    sense(
      'prawo:law',
      { ru: 'A2', by: 'A2', ua: 'A1' },
      {
        primary: true,
        translation_ru: ['право', 'закон'],
      },
    ),
    sense('prawo:right_side', A1, { translation_ru: ['правая сторона', 'направо'] }),
  ])

  it('index row: the levels are those of the primary sense per profile, not the word minimum', () => {
    const { row } = buildWordArtifacts(prawo, 17)
    expect(row).toEqual([
      'prawo|NOUN',
      POS.codeOf('NOUN'),
      105,
      LEVEL.codeOf('A2'),
      LEVEL.codeOf('A2'),
      LEVEL.codeOf('A1'),
      'право',
      senseShardIndex('prawo|NOUN'),
      17,
    ])
  })

  it('primaryRu is the first Russian translation of the primary sense', () => {
    const być = word('być', 'VERB', [
      sense('być:exist', A1, { translation_ru: ['существовать'] }),
      sense('być:copula', A1, { primary: true, translation_ru: ['быть', 'являться'] }),
    ])
    expect(buildWordArtifacts(być, 3).row[6]).toBe('быть')
  })

  it('senses: primary first, the rest in source order; ru + per-sense level codes only', () => {
    const być = word('być', 'VERB', [
      sense('być:exist', { ru: 'A2', by: 'B1', ua: 'A2' }),
      sense('być:copula', A1, { primary: true }),
      sense('być:future', { ru: 'B1', by: 'B1', ua: 'B1' }),
    ])
    const { senses } = buildWordArtifacts(być, 3)
    expect(senses).toEqual([
      { id: 'być:copula', ru: ['być:copula-ru'], lv: [1, 1, 1], primary: true },
      { id: 'być:exist', ru: ['być:exist-ru'], lv: [2, 3, 2], primary: false },
      { id: 'być:future', ru: ['być:future-ru'], lv: [3, 3, 3], primary: false },
    ])
  })

  it('details: Polish gloss/example and by/ua translations keyed by sense_id, same order', () => {
    const { details } = buildWordArtifacts(prawo, 17)
    expect(details).toEqual([
      [
        'prawo:law',
        {
          gl: 'prawo:law-gloss',
          ex: 'prawo:law-example',
          by: ['prawo:law-by'],
          ua: ['prawo:law-ua'],
        },
      ],
      [
        'prawo:right_side',
        {
          gl: 'prawo:right_side-gloss',
          ex: 'prawo:right_side-example',
          by: ['prawo:right_side-by'],
          ua: ['prawo:right_side-ua'],
        },
      ],
    ])
  })

  it('encodes the v2 parts of speech after the old ones (PRON = 5) and a missing paradigm as -1', () => {
    const to = word('to', 'PRON', [sense('to:this', A1, { primary: true })])
    const { row } = buildWordArtifacts(to, -1)
    expect(row[1]).toBe(5)
    expect(row[8]).toBe(-1)
  })

  it('throws for a word without a primary sense', () => {
    expect(() => buildWordArtifacts(word('x', 'NOUN', [sense('x:a', A1)]), -1)).toThrow(
      /x\|NOUN has no primary sense/,
    )
  })
})
