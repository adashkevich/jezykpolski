import { describe, expect, it } from 'vitest'
import {
  IndexJsonSchema,
  ManifestSchema,
  ParadigmsShardSchema,
  RawChunkWordSchema,
  RawWordV2Schema,
  SenseDetailsShardSchema,
  SensesShardSchema,
  WordsJsonV2Schema,
} from './content.schema.ts'

describe('content.schema output validation', () => {
  it('accepts a well-formed index.json row: three primary-sense levels (ru, by, ua)', () => {
    const row = ['kobieta|NOUN', 1, 95, 1, 1, 2, 'женщина', 10, 42]
    expect(IndexJsonSchema.safeParse([row]).success).toBe(true)
  })

  it('rejects an index row with the wrong arity (the v1 7-tuple included)', () => {
    expect(IndexJsonSchema.safeParse([['kobieta|NOUN', 1, 95]]).success).toBe(false)
    expect(IndexJsonSchema.safeParse([['kobieta|NOUN', 1, 95, 1, 'женщина', 10, 42]]).success).toBe(
      false,
    )
  })

  it('accepts a senses shard keyed by wordId', () => {
    const shard = {
      'prawo|NOUN': [
        { id: 'prawo:law', ru: ['право', 'закон'], lv: [2, 2, 2], primary: true },
        { id: 'prawo:right_side', ru: ['правая сторона'], lv: [1, 1, 1], primary: false },
      ],
    }
    expect(SensesShardSchema.safeParse(shard).success).toBe(true)
  })

  it('rejects a v1 sense entry (no id/lv, English gloss) and a level triple of the wrong length', () => {
    const v1 = { 'kobieta|NOUN': [{ ru: ['женщина'], en: 'woman', primary: true }] }
    expect(SensesShardSchema.safeParse(v1).success).toBe(false)
    const short = {
      'kobieta|NOUN': [{ id: 'kobieta:woman', ru: ['женщина'], lv: [1, 1], primary: true }],
    }
    expect(SensesShardSchema.safeParse(short).success).toBe(false)
  })

  it('accepts a sense-details shard keyed by sense_id, rejects an empty example', () => {
    const entry = {
      gl: 'dorosła osoba płci żeńskiej',
      ex: 'Ta kobieta jest lekarką.',
      by: ['жанчына'],
      ua: ['жінка'],
    }
    expect(SenseDetailsShardSchema.safeParse({ 'kobieta:woman': entry }).success).toBe(true)
    expect(
      SenseDetailsShardSchema.safeParse({ 'kobieta:woman': { ...entry, ex: '' } }).success,
    ).toBe(false)
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
      counts: { words: 7986, paradigms: 7987, forms: 195518 },
      shards: { senses: 16, senseDetails: 16, paradigms: 64 },
      codec: {
        pos: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'SCONJ', 'INTJ'],
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
      shards: { senses: 16, senseDetails: 16, paradigms: 64 },
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

describe('content.schema input validation, words.json v2', () => {
  const levels = { ru: 'A1', by: 'A1', ua: 'A2' }
  const confidence = { ru: 0.9, by: 0.9, ua: 0.8 }
  const sense = {
    sense_id: 'dom:building',
    translation_ru: ['дом'],
    translation_by: ['дом'],
    translation_ua: ['дім'],
    gloss_pl: 'budynek mieszkalny',
    example_pl: 'Mieszkam w małym domu.',
    introduced_at: levels,
    level_confidence: confidence,
    primary: true,
  }
  const word = {
    lemma: 'dom',
    pos: 'NOUN',
    frequency: { rank: 50, count: 100, per_million: 1, arf: 1, dispersion: 0.5 },
    introduced_at: levels,
    level_confidence: confidence,
    senses: [sense],
    morph_lemma: 'dom',
  }

  it('accepts a well-formed word; source and the sense-level pos are optional', () => {
    expect(RawWordV2Schema.safeParse(word).success).toBe(true)
    const withExtras = { ...word, senses: [{ ...sense, source: 'editor', pos: 'ADP' }] }
    expect(RawWordV2Schema.safeParse(withExtras).success).toBe(true)
  })

  it('accepts the parts of speech that appear only in v2 (PRON, SCONJ, INTJ)', () => {
    for (const pos of ['PRON', 'SCONJ', 'INTJ']) {
      expect(RawWordV2Schema.safeParse({ ...word, pos }).success).toBe(true)
    }
    expect(RawWordV2Schema.safeParse({ ...word, pos: 'ADP' }).success).toBe(false)
  })

  it('accepts DET only in a chunk word: the assembled dictionary has no DET (task 46)', () => {
    expect(RawChunkWordSchema.safeParse({ ...word, pos: 'DET' }).success).toBe(true)
    expect(RawWordV2Schema.safeParse({ ...word, pos: 'DET' }).success).toBe(false)
  })

  it('rejects a v1-style word: string introduced_at, numeric level_confidence', () => {
    expect(RawWordV2Schema.safeParse({ ...word, introduced_at: 'A1' }).success).toBe(false)
    expect(RawWordV2Schema.safeParse({ ...word, level_confidence: 0.9 }).success).toBe(false)
  })

  it('rejects a sense without translation_by, with an empty translation or an unknown level', () => {
    for (const bad of [
      { ...sense, translation_by: undefined },
      { ...sense, translation_ua: [] },
      { ...sense, gloss_pl: '' },
      { ...sense, introduced_at: { ...levels, by: 'D1' } },
      { ...sense, level_confidence: { ...confidence, ua: 1.5 } },
    ]) {
      expect(RawWordV2Schema.safeParse({ ...word, senses: [bad] }).success).toBe(false)
    }
  })

  it('accepts schema_version 2 only', () => {
    const file = {
      schema_version: 2,
      generated_at: 'x',
      source: 'y',
      counts: { total: 1 },
      words: [word],
    }
    expect(WordsJsonV2Schema.safeParse(file).success).toBe(true)
    expect(WordsJsonV2Schema.safeParse({ ...file, schema_version: 1 }).success).toBe(false)
  })
})
