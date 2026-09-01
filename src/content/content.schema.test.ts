import { describe, expect, it } from 'vitest'
import {
  IndexJsonSchema,
  ManifestSchema,
  ParadigmsShardSchema,
  RawWordSchema,
  SensesShardSchema,
} from './content.schema.ts'

describe('content.schema input validation', () => {
  it('accepts a well-formed word, including a sense with a null gloss_en (834 real occurrences)', () => {
    const result = RawWordSchema.safeParse({
      lemma: 'kobieta',
      pos: 'NOUN',
      frequency: { rank: 95, count: 100, per_million: 1, arf: 1, dispersion: 0.5 },
      introduced_at: 'A1',
      level_confidence: 0.9,
      senses: [{ translation_ru: ['женщина'], gloss_en: null, primary: true, source: 'model' }],
      morph_lemma: 'kobieta',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a word with morph_lemma: null (the 14 real words with no paradigm)', () => {
    const result = RawWordSchema.safeParse({
      lemma: 'a',
      pos: 'NOUN',
      frequency: { rank: 1, count: 1, per_million: 1, arf: 1, dispersion: 0.5 },
      introduced_at: 'A1',
      level_confidence: 0.9,
      senses: [{ translation_ru: ['а'], gloss_en: 'a', primary: true, source: 'model' }],
      morph_lemma: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a word with an unknown pos', () => {
    const result = RawWordSchema.safeParse({
      lemma: 'x',
      pos: 'PRON',
      frequency: { rank: 1, count: 1, per_million: 1, arf: 1, dispersion: 0.5 },
      introduced_at: 'A1',
      level_confidence: 0.9,
      senses: [{ translation_ru: ['x'], primary: true, source: 'model' }],
      morph_lemma: 'x',
    })
    expect(result.success).toBe(false)
  })
})

describe('content.schema output validation', () => {
  it('accepts a well-formed index.json row array', () => {
    expect(IndexJsonSchema.safeParse([['kobieta|NOUN', 1, 95, 1, 'женщина', 10, 42]]).success).toBe(
      true,
    )
  })

  it('rejects an index row with the wrong arity', () => {
    expect(IndexJsonSchema.safeParse([['kobieta|NOUN', 1, 95]]).success).toBe(false)
  })

  it('accepts a senses shard keyed by wordId', () => {
    const shard = { 'kobieta|NOUN': [{ ru: ['женщина'], en: 'woman', primary: true }] }
    expect(SensesShardSchema.safeParse(shard).success).toBe(true)
  })

  it('accepts a paradigms shard entry with dominantGender', () => {
    const shard = {
      'bmw|NOUN': {
        forms: [['bmw', 1, 1, 5, 0, 0, 0, 0, 0, 0]],
        dominantGender: 5,
      },
    }
    expect(ParadigmsShardSchema.safeParse(shard).success).toBe(true)
  })

  it('accepts a paradigms shard entry without dominantGender (VERB/ADJ)', () => {
    const shard = { 'być|VERB': { forms: [['jestem', 1, 0, 0, 0, 1, 1, 1, 1, 0]] } }
    expect(ParadigmsShardSchema.safeParse(shard).success).toBe(true)
  })

  it('validates manifest.json (the only artifact validated at runtime)', () => {
    const manifest = {
      contentVersion: 'abcdef123456',
      generatedAt: '2026-09-01T05:18:06+00:00',
      counts: { words: 7998, paradigms: 7986, forms: 195487 },
      shards: { senses: 16, paradigms: 64 },
      codec: {
        pos: ['NOUN', 'VERB', 'ADJ', 'ADV'],
        level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        number: ['singular', 'plural'],
        case: ['nominative'],
        gender: ['feminine'],
        degree: ['positive'],
        tense: ['present'],
        mood: ['indicative'],
        aspect: ['imperfective'],
        person: [1, 2, 3],
      },
    }
    expect(ManifestSchema.safeParse(manifest).success).toBe(true)
  })

  it('rejects a manifest with a malformed contentVersion length', () => {
    const manifest = {
      contentVersion: 'short',
      generatedAt: '2026-09-01T05:18:06+00:00',
      counts: { words: 1, paradigms: 1, forms: 1 },
      shards: { senses: 16, paradigms: 64 },
      codec: {
        pos: [],
        level: [],
        number: [],
        case: [],
        gender: [],
        degree: [],
        tense: [],
        mood: [],
        aspect: [],
        person: [],
      },
    }
    expect(ManifestSchema.safeParse(manifest).success).toBe(false)
  })
})
