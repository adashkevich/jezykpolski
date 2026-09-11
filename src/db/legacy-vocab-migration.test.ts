/**
 * `legacy-vocab-migration.ts` (`spec/tasks/37-three-stage-vocabulary.md` §3) — pure
 * transform functions. `database.test.ts`'s "version(2) migration" block covers the real
 * Dexie upgrade path these get wired into.
 */
import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import {
  LEGACY_VOCAB_RU_PL_DIMENSION,
  migrateLegacyReviewLogSkillId,
  migrateLegacySkills,
  renameLegacyRuPlSkillId,
} from './legacy-vocab-migration.ts'

function skill(overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId' | 'dimension'>): SkillRecord {
  return {
    kind: 'vocab',
    state: 'review',
    stability: 1,
    difficulty: 5,
    due: 0,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('LEGACY_VOCAB_RU_PL_DIMENSION', () => {
  it('is the old dimension string, not a member of the current Dimension union', () => {
    expect(LEGACY_VOCAB_RU_PL_DIMENSION).toBe('vocab:ru-pl')
  })
})

describe('renameLegacyRuPlSkillId', () => {
  it('renames a legacy skillId to the vocab:ru-pl-input equivalent', () => {
    expect(renameLegacyRuPlSkillId('kobieta|NOUN::vocab:ru-pl')).toBe(
      'kobieta|NOUN::vocab:ru-pl-input',
    )
  })

  it('leaves every other skillId unchanged, including current vocab dimensions', () => {
    expect(renameLegacyRuPlSkillId('kobieta|NOUN::vocab:pl-ru')).toBe('kobieta|NOUN::vocab:pl-ru')
    expect(renameLegacyRuPlSkillId('kobieta|NOUN::vocab:ru-pl-choice')).toBe(
      'kobieta|NOUN::vocab:ru-pl-choice',
    )
    expect(renameLegacyRuPlSkillId('kobieta|NOUN::vocab:ru-pl-input')).toBe(
      'kobieta|NOUN::vocab:ru-pl-input',
    )
    expect(renameLegacyRuPlSkillId('kobieta|NOUN::noun:sg:genitive')).toBe(
      'kobieta|NOUN::noun:sg:genitive',
    )
  })
})

describe('migrateLegacyReviewLogSkillId', () => {
  it('is the same rename as renameLegacyRuPlSkillId', () => {
    expect(migrateLegacyReviewLogSkillId('kobieta|NOUN::vocab:ru-pl')).toBe(
      'kobieta|NOUN::vocab:ru-pl-input',
    )
    expect(migrateLegacyReviewLogSkillId('kobieta|NOUN::vocab:pl-ru')).toBe(
      'kobieta|NOUN::vocab:pl-ru',
    )
  })
})

describe('migrateLegacySkills', () => {
  it('renames a legacy row and backfills a vocab:ru-pl-choice sibling copying its SRS state', () => {
    const legacy = skill({
      skillId: 'kobieta|NOUN::vocab:ru-pl',
      wordId: 'kobieta|NOUN',
      dimension: 'vocab:ru-pl',
      state: 'review',
      stability: 25,
      difficulty: 4,
      due: 2000,
      reps: 5,
      lapses: 1,
      correct: 5,
      incorrect: 1,
    })

    const migrated = migrateLegacySkills([legacy])
    expect(migrated).toHaveLength(2)

    const input = migrated.find((s) => s.dimension === 'vocab:ru-pl-input')!
    expect(input.skillId).toBe('kobieta|NOUN::vocab:ru-pl-input')
    expect(input.wordId).toBe('kobieta|NOUN')
    // Every other field carries over verbatim from the legacy row.
    expect(input.state).toBe('review')
    expect(input.stability).toBe(25)
    expect(input.difficulty).toBe(4)
    expect(input.reps).toBe(5)
    expect(input.lapses).toBe(1)
    expect(input.correct).toBe(5)
    expect(input.incorrect).toBe(1)

    const choice = migrated.find((s) => s.dimension === 'vocab:ru-pl-choice')!
    expect(choice.skillId).toBe('kobieta|NOUN::vocab:ru-pl-choice')
    // Backfilled as a COPY of the same SRS state, not a fresh "new" row — see this module's
    // header for why (avoiding a vocabMaturity regression for already-advanced words).
    expect(choice.state).toBe('review')
    expect(choice.stability).toBe(25)
    expect(choice.reps).toBe(5)
  })

  it('leaves already-current vocab rows and morphological rows untouched', () => {
    const plRu = skill({ skillId: 'kobieta|NOUN::vocab:pl-ru', wordId: 'kobieta|NOUN', dimension: 'vocab:pl-ru' })
    const noun = skill({
      skillId: 'kobieta|NOUN::noun:sg:genitive',
      wordId: 'kobieta|NOUN',
      dimension: 'noun:sg:genitive',
      kind: 'noun',
    })

    const migrated = migrateLegacySkills([plRu, noun])
    expect(migrated).toEqual([plRu, noun])
  })

  it('an empty input produces an empty output', () => {
    expect(migrateLegacySkills([])).toEqual([])
  })

  it('handles several legacy rows (different words) independently', () => {
    const a = skill({ skillId: 'a|NOUN::vocab:ru-pl', wordId: 'a|NOUN', dimension: 'vocab:ru-pl' })
    const b = skill({ skillId: 'b|VERB::vocab:ru-pl', wordId: 'b|VERB', dimension: 'vocab:ru-pl' })

    const migrated = migrateLegacySkills([a, b])
    expect(migrated).toHaveLength(4)
    expect(migrated.filter((s) => s.wordId === 'a|NOUN')).toHaveLength(2)
    expect(migrated.filter((s) => s.wordId === 'b|VERB')).toHaveLength(2)
  })
})
