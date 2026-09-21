/**
 * `stage.ts` (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2,
 * `spec/tasks/37-three-stage-vocabulary.md` §1-2, `spec/tasks/40-vocab-streak-progression.md`,
 * FR-80/FR-81/FR-83).
 */
import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import {
  CUED_RECALL_UNLOCK_STABILITY_DAYS,
  CUED_RECALL_UNLOCK_STREAK,
  hasGraduatedProduction,
  isAwaitingRecognition,
  lowerVocabDimensions,
  nextCorrectStreak,
  PRODUCTION_UNLOCK_STREAK,
  RECOGNITION_UNLOCK_STABILITY_DAYS,
  RELEARN_RECOGNITION_STREAK,
  shouldLiftRecognitionLock,
  shouldUnlockCuedRecall,
  shouldUnlockProduction,
  stageOf,
  withoutRecognitionLock,
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

describe('nextCorrectStreak', () => {
  it('верный ответ увеличивает серию на 1', () => {
    expect(nextCorrectStreak(1, true, true)).toBe(2)
  })

  it('неверный ответ обнуляет серию', () => {
    expect(nextCorrectStreak(5, false, true)).toBe(0)
  })

  it('без предыдущей серии стартует с 0/1', () => {
    expect(nextCorrectStreak(undefined, true, true)).toBe(1)
    expect(nextCorrectStreak(undefined, false, true)).toBe(0)
  })

  it('srsApplied=false оставляет серию как была, независимо от исхода', () => {
    expect(nextCorrectStreak(2, true, false)).toBe(2)
    expect(nextCorrectStreak(2, false, false)).toBe(2)
    expect(nextCorrectStreak(undefined, true, false)).toBe(0)
  })
})

describe('shouldUnlockCuedRecall', () => {
  it('открывает этап 2 при серии верных ответов подряд, достигшей порога', () => {
    expect(
      shouldUnlockCuedRecall(record('vocab:pl-ru', { correctStreak: CUED_RECALL_UNLOCK_STREAK })),
    ).toBe(true)
    expect(
      shouldUnlockCuedRecall(record('vocab:pl-ru', { correctStreak: CUED_RECALL_UNLOCK_STREAK + 5 })),
    ).toBe(true)
  })

  it('не открывает этап 2, пока серия ниже порога и стабильность ниже порога', () => {
    expect(
      shouldUnlockCuedRecall(
        record('vocab:pl-ru', { correctStreak: CUED_RECALL_UNLOCK_STREAK - 1, stability: 0 }),
      ),
    ).toBe(false)
  })

  it('запасная ветка: свайп-известное слово (stability на floor, correctStreak: 0) тоже открывает этап 2', () => {
    expect(
      shouldUnlockCuedRecall(
        record('vocab:pl-ru', { correctStreak: 0, stability: RECOGNITION_UNLOCK_STABILITY_DAYS }),
      ),
    ).toBe(true)
  })

  it('нет записи узнавания — нечего выпускать', () => {
    expect(shouldUnlockCuedRecall(undefined)).toBe(false)
  })
})

describe('shouldUnlockProduction', () => {
  it('открывает этап 3 при трёх верных ответах подряд на этапе 2', () => {
    expect(
      shouldUnlockProduction(record('vocab:ru-pl-choice', { correctStreak: PRODUCTION_UNLOCK_STREAK })),
    ).toBe(true)
  })

  it('двух верных ответов подряд недостаточно', () => {
    expect(
      shouldUnlockProduction(
        record('vocab:ru-pl-choice', { correctStreak: PRODUCTION_UNLOCK_STREAK - 1, stability: 0 }),
      ),
    ).toBe(false)
  })

  it('запасная ветка: свайп-известное слово открывает этап 3 без серии', () => {
    expect(
      shouldUnlockProduction(
        record('vocab:ru-pl-choice', {
          correctStreak: 0,
          stability: CUED_RECALL_UNLOCK_STABILITY_DAYS,
        }),
      ),
    ).toBe(true)
  })

  it('нет записи этапа 2 — нечего выпускать', () => {
    expect(shouldUnlockProduction(undefined)).toBe(false)
  })
})

describe('RELEARN_RECOGNITION_STREAK (задача 43 §3)', () => {
  it('короче первого прохождения: повторное обучение после «Показать слово» короче исходного порога открытия ввода', () => {
    expect(RELEARN_RECOGNITION_STREAK).toBe(2)
    expect(RELEARN_RECOGNITION_STREAK).toBeLessThan(PRODUCTION_UNLOCK_STREAK)
  })
})

describe('shouldLiftRecognitionLock (задача 43 §3)', () => {
  it('снимает блокировку, когда серия на vocab:ru-pl-choice достигла порога', () => {
    expect(
      shouldLiftRecognitionLock(
        record('vocab:ru-pl-choice', { correctStreak: RELEARN_RECOGNITION_STREAK }),
      ),
    ).toBe(true)
    expect(
      shouldLiftRecognitionLock(
        record('vocab:ru-pl-choice', { correctStreak: RELEARN_RECOGNITION_STREAK + 3 }),
      ),
    ).toBe(true)
  })

  it('не снимает, пока серия ниже порога — и стабильность здесь ничего не решает', () => {
    expect(
      shouldLiftRecognitionLock(
        record('vocab:ru-pl-choice', {
          correctStreak: RELEARN_RECOGNITION_STREAK - 1,
          stability: 100,
        }),
      ),
    ).toBe(false)
    expect(shouldLiftRecognitionLock(record('vocab:ru-pl-choice'))).toBe(false)
  })

  it('нет записи этапа 2 — нечего снимать', () => {
    expect(shouldLiftRecognitionLock(undefined)).toBe(false)
  })
})

describe('isAwaitingRecognition / withoutRecognitionLock (задача 43 §1)', () => {
  it('isAwaitingRecognition читает флаг записи; undefined и запись без флага — не заблокированы', () => {
    expect(isAwaitingRecognition(record('vocab:ru-pl-input', { awaitingRecognition: true }))).toBe(
      true,
    )
    expect(isAwaitingRecognition(record('vocab:ru-pl-input'))).toBe(false)
    expect(isAwaitingRecognition(undefined)).toBe(false)
  })

  it('withoutRecognitionLock убирает поле целиком, остальные поля не трогает', () => {
    const locked = record('vocab:ru-pl-input', { awaitingRecognition: true, due: 42 })
    const unlocked = withoutRecognitionLock(locked)
    expect('awaitingRecognition' in unlocked).toBe(false)
    expect(unlocked).toEqual(record('vocab:ru-pl-input', { due: 42 }))
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

describe('lowerVocabDimensions', () => {
  it('vocab:pl-ru has nothing below it', () => {
    expect(lowerVocabDimensions('vocab:pl-ru')).toEqual([])
  })

  it('vocab:ru-pl-choice has only vocab:pl-ru below it', () => {
    expect(lowerVocabDimensions('vocab:ru-pl-choice')).toEqual(['vocab:pl-ru'])
  })

  it('vocab:ru-pl-input has both choice stages below it, in ascending order', () => {
    expect(lowerVocabDimensions('vocab:ru-pl-input')).toEqual(['vocab:pl-ru', 'vocab:ru-pl-choice'])
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
