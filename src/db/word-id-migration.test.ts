/**
 * `word-id-migration.ts` (`spec/tasks/48-progress-migration-word-id-renames.md` §1) — pure
 * transform functions. The Dexie step and the backup path that use them are covered by
 * `repositories/word-id-renames.repository.test.ts` (fake-indexeddb).
 */
import { describe, expect, it } from 'vitest'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type WordId } from '@/learning/skills/skill-id.ts'
import { kindOfDimension } from '@/learning/skills/enumerate.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'
import {
  WORD_ID_RENAMES,
  migrateReviewLog,
  migrateReviewLogsForRenames,
  migrateSkillsForRenames,
  type HasDimension,
} from './word-id-migration.ts'

function skill(
  wordId: WordId,
  dimension: Dimension,
  overrides: Partial<SkillRecord> = {},
): SkillRecord {
  return {
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    kind: kindOfDimension(dimension),
    dimension,
    state: 'review',
    stability: 10,
    difficulty: 5,
    due: 5000,
    lastReviewAt: 1000,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 100,
    updatedAt: 1000,
    ...overrides,
  }
}

function log(wordId: WordId, dimension: Dimension, id: number): ReviewLogRecord {
  return {
    id,
    sessionId: 1,
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    exerciseType: 'choice',
    reviewedAt: 1000 + id,
    rating: 3,
    correct: true,
    answerGiven: 'x',
    expected: 'x',
    elapsedMs: 900,
    srsApplied: true,
  }
}

/** Vocab dimensions everywhere; grammar only where listed. */
function dimensions(grammar: Record<WordId, readonly string[]>): HasDimension {
  return (wordId, dimension) =>
    dimension.startsWith('vocab:') || (grammar[wordId] ?? []).includes(dimension)
}

const RENAMES = { 'to|NOUN': 'to|PRON', 'dziś|NOUN': 'dziś|ADV', 'spocić|VERB': 'spocić się|VERB' }

describe('WORD_ID_RENAMES (data/word-id-renames.json, task 46)', () => {
  it('has the 37 renames, e.g. to|NOUN → to|PRON and spocić|VERB → spocić się|VERB', () => {
    expect(Object.keys(WORD_ID_RENAMES)).toHaveLength(37)
    expect(WORD_ID_RENAMES['to|NOUN']).toBe('to|PRON')
    expect(WORD_ID_RENAMES['spocić|VERB']).toBe('spocić się|VERB')
    expect(WORD_ID_RENAMES['dziś|NOUN']).toBe('dziś|ADV')
  })

  it('no key is also a new wordId — the precondition for idempotency', () => {
    const targets = new Set(Object.values(WORD_ID_RENAMES))
    expect(Object.keys(WORD_ID_RENAMES).filter((key) => targets.has(key))).toEqual([])
  })
})

describe('migrateSkillsForRenames', () => {
  it('moves a skill to the new wordId with every other field untouched', () => {
    const old = skill('spocić|VERB', 'verb:future:1:sg', { stability: 42, due: 9999, lapses: 2 })
    const result = migrateSkillsForRenames(
      [old],
      RENAMES,
      dimensions({ 'spocić się|VERB': ['verb:future:1:sg'] }),
    )

    expect(result.put).toEqual([
      {
        ...old,
        skillId: encodeSkillId('spocić się|VERB', 'verb:future:1:sg'),
        wordId: 'spocić się|VERB',
      },
    ])
    expect(result.delete).toEqual([old.skillId])
    expect(result.dropped).toEqual([])
  })

  it('drops a dimension the new word does not have, keeps vocab', () => {
    const genitive = skill('to|NOUN', 'noun:sg:genitive')
    const vocab = skill('to|NOUN', 'vocab:pl-ru')
    const result = migrateSkillsForRenames([genitive, vocab], RENAMES, dimensions({}))

    expect(result.dropped).toEqual([genitive])
    expect(result.put.map((s) => s.skillId)).toEqual([encodeSkillId('to|PRON', 'vocab:pl-ru')])
    expect(result.delete.sort()).toEqual([genitive.skillId, vocab.skillId].sort())
  })

  it('merge: the started skill wins over a new one, counters are summed', () => {
    const old = skill('dziś|NOUN', 'vocab:pl-ru', {
      state: 'review',
      reps: 5,
      correct: 4,
      incorrect: 1,
      correctStreak: 3,
      stability: 12,
    })
    const existing = skill('dziś|ADV', 'vocab:pl-ru', {
      state: 'new',
      reps: 0,
      correct: 2,
      incorrect: 2,
      correctStreak: 0,
      stability: 0,
      lastReviewAt: undefined,
    })
    const result = migrateSkillsForRenames([existing, old], RENAMES, dimensions({}))

    expect(result.put).toEqual([
      {
        ...old,
        skillId: existing.skillId,
        wordId: 'dziś|ADV',
        correct: 6,
        incorrect: 3,
      },
    ])
    expect(result.delete).toEqual([old.skillId])
  })

  it('merge: the existing skill wins when it has more progress — its FSRS fields are kept whole', () => {
    const old = skill('dziś|NOUN', 'vocab:pl-ru', {
      reps: 2,
      stability: 3,
      awaitingRecognition: true,
    })
    const existing = skill('dziś|ADV', 'vocab:pl-ru', { reps: 7, stability: 30, correctStreak: 4 })
    const [merged] = migrateSkillsForRenames([old, existing], RENAMES, dimensions({})).put

    expect(merged).toEqual({ ...existing, correct: existing.correct + old.correct, incorrect: 0 })
    expect(merged).not.toHaveProperty('awaitingRecognition')
  })

  it('merge tie-breakers: more reps, then the later lastReviewAt; a full tie keeps the existing row', () => {
    const hasDim = dimensions({})
    const pick = (old: Partial<SkillRecord>, existing: Partial<SkillRecord>) =>
      migrateSkillsForRenames(
        [
          skill('dziś|NOUN', 'vocab:pl-ru', { ...old, stability: 1 }),
          skill('dziś|ADV', 'vocab:pl-ru', { ...existing, stability: 2 }),
        ],
        RENAMES,
        hasDim,
      ).put[0]!.stability

    // `state !== 'new'` outranks reps (contrived numbers — only the order of the rules matters).
    expect(pick({ state: 'review', reps: 1 }, { state: 'new', reps: 3 })).toBe(1)
    expect(pick({ state: 'new', reps: 3 }, { state: 'learning', reps: 1 })).toBe(2)
    expect(pick({ reps: 4 }, { reps: 3 })).toBe(1)
    expect(pick({ reps: 3, lastReviewAt: 2000 }, { reps: 3, lastReviewAt: 1500 })).toBe(1)
    expect(pick({ reps: 3, lastReviewAt: 1500 }, { reps: 3, lastReviewAt: 2000 })).toBe(2)
    expect(pick({ reps: 3, lastReviewAt: 1500 }, { reps: 3, lastReviewAt: 1500 })).toBe(2)
  })

  it('two old words onto one new id with no stored target: merged by the same rule', () => {
    const renames = { 'a|NOUN': 'c|NOUN', 'b|NOUN': 'c|NOUN' }
    const a = skill('a|NOUN', 'vocab:pl-ru', { reps: 2, stability: 1, correct: 2 })
    const b = skill('b|NOUN', 'vocab:pl-ru', { reps: 4, stability: 2, correct: 1, incorrect: 1 })
    const result = migrateSkillsForRenames([a, b], renames, dimensions({}))

    expect(result.put).toEqual([
      {
        ...b,
        skillId: encodeSkillId('c|NOUN', 'vocab:pl-ru'),
        wordId: 'c|NOUN',
        correct: 3,
        incorrect: 1,
      },
    ])
    expect(result.delete.sort()).toEqual([a.skillId, b.skillId].sort())
  })

  it('ignores skills of words outside the map and target skills nothing merges into', () => {
    const unrelated = skill('kobieta|NOUN', 'vocab:pl-ru')
    const targetOnly = skill('dziś|ADV', 'vocab:ru-pl-input')
    const result = migrateSkillsForRenames([unrelated, targetOnly], RENAMES, dimensions({}))
    expect(result).toEqual({ put: [], delete: [], dropped: [] })
  })

  it('propagates a throwing hasDimension instead of guessing', () => {
    const boom: HasDimension = () => {
      throw new Error('not loaded')
    }
    expect(() => migrateSkillsForRenames([skill('to|NOUN', 'vocab:pl-ru')], RENAMES, boom)).toThrow(
      'not loaded',
    )
  })
})

describe('migrateReviewLog / migrateReviewLogsForRenames', () => {
  it('migrateReviewLog rewrites skillId and wordId; other logs come back by reference', () => {
    const renamed = log('spocić|VERB', 'verb:past:1:sg:masculine', 1)
    const other = log('kobieta|NOUN', 'vocab:pl-ru', 2)

    expect(migrateReviewLog(renamed, RENAMES)).toEqual({
      ...renamed,
      wordId: 'spocić się|VERB',
      skillId: encodeSkillId('spocić się|VERB', 'verb:past:1:sg:masculine'),
    })
    expect(migrateReviewLog(other, RENAMES)).toBe(other)
  })

  it('keeps logs of dropped dimensions with their old ids, rewrites the rest', () => {
    const dropped = log('to|NOUN', 'noun:sg:genitive', 1)
    const vocab = log('to|NOUN', 'vocab:pl-ru', 2)
    const other = log('kobieta|NOUN', 'vocab:pl-ru', 3)

    const result = migrateReviewLogsForRenames([dropped, vocab, other], RENAMES, dimensions({}))

    expect(result[0]).toBe(dropped)
    expect(result[1]).toEqual({
      ...vocab,
      wordId: 'to|PRON',
      skillId: encodeSkillId('to|PRON', 'vocab:pl-ru'),
    })
    expect(result[2]).toBe(other)
  })
})
