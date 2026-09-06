/**
 * `stage.ts` (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2, FR-80/FR-83).
 */
import { describe, expect, it } from 'vitest'
import type { SkillRecord, SkillState } from '@/types/progress.ts'
import { shouldUnlockProduction, stageOf } from './stage.ts'

function record(dimension: string, state: SkillState = 'review'): SkillRecord {
  return {
    skillId: `kobieta|NOUN::${dimension}`,
    wordId: 'kobieta|NOUN',
    kind: dimension.startsWith('vocab') ? 'vocab' : 'noun',
    dimension: dimension as SkillRecord['dimension'],
    state,
    stability: 1,
    difficulty: 5,
    due: 0,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('shouldUnlockProduction', () => {
  it('открывает этап 2 ровно тогда, когда узнавание выпустилось в review', () => {
    expect(shouldUnlockProduction(record('vocab:pl-ru', 'review'))).toBe(true)
  })

  it.each<SkillState>(['new', 'learning', 'relearning'])(
    'не открывает этап 2 в состоянии %s',
    (state) => {
      expect(shouldUnlockProduction(record('vocab:pl-ru', state))).toBe(false)
    },
  )

  it('нет записи узнавания — нечего выпускать', () => {
    expect(shouldUnlockProduction(undefined)).toBe(false)
  })
})

describe('stageOf', () => {
  it('"not-started" на пустом списке', () => {
    expect(stageOf([])).toBe('not-started')
  })

  it('"recognition", пока есть только vocab:pl-ru', () => {
    expect(stageOf([record('vocab:pl-ru')])).toBe('recognition')
  })

  it('"production", как только появился vocab:ru-pl', () => {
    expect(stageOf([record('vocab:pl-ru'), record('vocab:ru-pl')])).toBe('production')
  })

  it('морфологические навыки на этап не влияют', () => {
    expect(stageOf([record('noun:sg:genitive')])).toBe('not-started')
    expect(stageOf([record('vocab:pl-ru'), record('noun:sg:genitive')])).toBe('recognition')
  })
})
