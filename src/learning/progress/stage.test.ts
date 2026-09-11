/**
 * `stage.ts` (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2,
 * `spec/tasks/37-three-stage-vocabulary.md` §1-2, FR-80/FR-81/FR-83).
 */
import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import {
  CUED_RECALL_UNLOCK_STABILITY_DAYS,
  hasGraduatedProduction,
  RECOGNITION_UNLOCK_STABILITY_DAYS,
  shouldUnlockCuedRecall,
  shouldUnlockProduction,
  stageOf,
} from './stage.ts'

function record(
  dimension: string,
  overrides: Partial<SkillRecord> = {},
): SkillRecord {
  return {
    skillId: `kobieta|NOUN::${dimension}`,
    wordId: 'kobieta|NOUN',
    kind: dimension.startsWith('vocab') ? 'vocab' : 'noun',
    dimension,
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

describe('shouldUnlockCuedRecall', () => {
  it('открывает этап 2 ровно тогда, когда стабильность узнавания достигла порога', () => {
    expect(
      shouldUnlockCuedRecall(record('vocab:pl-ru', { stability: RECOGNITION_UNLOCK_STABILITY_DAYS })),
    ).toBe(true)
    expect(
      shouldUnlockCuedRecall(
        record('vocab:pl-ru', { stability: RECOGNITION_UNLOCK_STABILITY_DAYS + 5 }),
      ),
    ).toBe(true)
  })

  it('не открывает этап 2, пока стабильность ниже порога', () => {
    expect(
      shouldUnlockCuedRecall(
        record('vocab:pl-ru', { stability: RECOGNITION_UNLOCK_STABILITY_DAYS - 0.1 }),
      ),
    ).toBe(false)
  })

  it('нет записи узнавания — нечего выпускать', () => {
    expect(shouldUnlockCuedRecall(undefined)).toBe(false)
  })
})

describe('shouldUnlockProduction', () => {
  it('открывает этап 3 ровно тогда, когда стабильность этапа 2 достигла порога', () => {
    expect(
      shouldUnlockProduction(
        record('vocab:ru-pl-choice', { stability: CUED_RECALL_UNLOCK_STABILITY_DAYS }),
      ),
    ).toBe(true)
  })

  it('не открывает этап 3, пока стабильность ниже порога', () => {
    expect(
      shouldUnlockProduction(
        record('vocab:ru-pl-choice', { stability: CUED_RECALL_UNLOCK_STABILITY_DAYS - 0.1 }),
      ),
    ).toBe(false)
  })

  it('нет записи этапа 2 — нечего выпускать', () => {
    expect(shouldUnlockProduction(undefined)).toBe(false)
  })
})

describe('hasGraduatedProduction', () => {
  it('true, когда vocab:ru-pl-input в состоянии review', () => {
    expect(hasGraduatedProduction([record('vocab:ru-pl-input', { state: 'review' })])).toBe(true)
  })

  it.each(['new', 'learning', 'relearning'] as const)(
    'false в состоянии %s',
    (state) => {
      expect(hasGraduatedProduction([record('vocab:ru-pl-input', { state })])).toBe(false)
    },
  )

  it('false, если навыка ввода вообще нет', () => {
    expect(hasGraduatedProduction([record('vocab:pl-ru'), record('vocab:ru-pl-choice')])).toBe(
      false,
    )
  })
})

describe('stageOf', () => {
  it('"not-started" на пустом списке', () => {
    expect(stageOf([])).toBe('not-started')
  })

  it('"recognition", пока есть только vocab:pl-ru', () => {
    expect(stageOf([record('vocab:pl-ru')])).toBe('recognition')
  })

  it('"cued-recall", как только появился vocab:ru-pl-choice', () => {
    expect(stageOf([record('vocab:pl-ru'), record('vocab:ru-pl-choice')])).toBe('cued-recall')
  })

  it('"production", как только появился vocab:ru-pl-input', () => {
    expect(
      stageOf([
        record('vocab:pl-ru'),
        record('vocab:ru-pl-choice'),
        record('vocab:ru-pl-input'),
      ]),
    ).toBe('production')
  })

  it('морфологические навыки на этап не влияют', () => {
    expect(stageOf([record('noun:sg:genitive')])).toBe('not-started')
    expect(stageOf([record('vocab:pl-ru'), record('noun:sg:genitive')])).toBe('recognition')
  })
})
