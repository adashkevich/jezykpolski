/**
 * `accuracy.ts` — единое определение «чистого первого ответа»
 * (`spec/tasks/45-accuracy-counts-first-clean-answer.md` §1-3). Чистая логика: ни Dexie, ни React.
 */
import { describe, expect, it } from 'vitest'
import type { DailyStatsRecord, ReviewLogRecord } from '@/types/progress.ts'
import {
  dailyAccuracyPercent,
  firstLogsBySkill,
  isCleanAnswer,
  isCleanLog,
  isFirstInSessionLog,
  summarizeFirstAnswers,
} from './accuracy.ts'

function log(overrides: Partial<ReviewLogRecord> = {}): ReviewLogRecord {
  return {
    sessionId: 1,
    skillId: 'kobieta|NOUN::vocab:pl-ru',
    wordId: 'kobieta|NOUN',
    exerciseType: 'choice',
    reviewedAt: 1000,
    rating: 3,
    correct: true,
    answerGiven: 'женщина',
    expected: 'женщина',
    elapsedMs: 500,
    srsApplied: true,
    ...overrides,
  }
}

function stats(overrides: Partial<DailyStatsRecord> = {}): DailyStatsRecord {
  return {
    date: '2026-09-22',
    reviewsCount: 0,
    correctCount: 0,
    newSkillsStarted: 0,
    sessionsCount: 0,
    timeSpentMs: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('isCleanAnswer (§1)', () => {
  it('выбор: верный ответ чистый, неверный — нет', () => {
    expect(isCleanAnswer({ correct: true })).toBe(true)
    expect(isCleanAnswer({ correct: false })).toBe(false)
  })

  it('набор: чистый только безупречный (ноль ошибок, ноль подсказок, без «глазка»)', () => {
    expect(isCleanAnswer({ correct: true }, { mistakes: 0, hintsUsed: 0, revealed: false })).toBe(true)
    expect(isCleanAnswer({ correct: true }, { mistakes: 1, hintsUsed: 0, revealed: false })).toBe(false)
    expect(isCleanAnswer({ correct: true }, { mistakes: 0, hintsUsed: 1, revealed: false })).toBe(false)
    expect(isCleanAnswer({ correct: true }, { mistakes: 0, hintsUsed: 0, revealed: true })).toBe(false)
  })

  it('набор: безупречная попытка с неверным итогом (near-miss таблицы: correct=false) не чистая', () => {
    expect(isCleanAnswer({ correct: false }, { mistakes: 0, hintsUsed: 0, revealed: false })).toBe(false)
  })
})

describe('isCleanLog — запасное правило для старых логов (§2)', () => {
  it('явное поле clean главнее рейтинга и correct', () => {
    expect(isCleanLog(log({ clean: true, correct: false, rating: 1 }))).toBe(true)
    expect(isCleanLog(log({ clean: false, correct: true, rating: 4 }))).toBe(false)
  })

  it('старый лог без поля: верный и не Hard — чистый', () => {
    expect(isCleanLog(log({ correct: true, rating: 3 }))).toBe(true)
    expect(isCleanLog(log({ correct: true, rating: 4 }))).toBe(true)
  })

  it('старый лог без поля: верный, но Hard (ошибка/подсказка при наборе) — не чистый', () => {
    expect(isCleanLog(log({ correct: true, rating: 2 }))).toBe(false)
  })

  it('старый лог без поля: неверный — не чистый', () => {
    expect(isCleanLog(log({ correct: false, rating: 1 }))).toBe(false)
  })
})

describe('isFirstInSessionLog — запасное правило для старых логов (§2)', () => {
  it('явное поле главнее srsApplied', () => {
    expect(isFirstInSessionLog(log({ firstInSession: true, srsApplied: false }))).toBe(true)
    expect(isFirstInSessionLog(log({ firstInSession: false, srsApplied: true }))).toBe(false)
  })

  it('старый лог без поля: первым считается тот, к которому применён SRS', () => {
    expect(isFirstInSessionLog(log({ srsApplied: true }))).toBe(true)
    expect(isFirstInSessionLog(log({ srsApplied: false }))).toBe(false)
  })
})

describe('firstLogsBySkill / summarizeFirstAnswers', () => {
  it('берёт самый ранний лог по навыку; повтор после ошибки счёт не меняет (0/1, а не 1/2)', () => {
    const logs = [
      log({ reviewedAt: 2000, clean: true, firstInSession: false }), // верный повтор
      log({ reviewedAt: 1000, clean: false, correct: false, rating: 1, firstInSession: true }),
    ]
    expect(firstLogsBySkill(logs)).toHaveLength(1)
    expect(summarizeFirstAnswers(logs)).toEqual({ totalCount: 1, correctCount: 0 })
  })

  it('чистый ответ — 1/1; безупречные и с исправлением считаются по-разному', () => {
    const logs = [
      log({ skillId: 'a|NOUN::vocab:pl-ru', reviewedAt: 1, clean: true }),
      log({ skillId: 'b|NOUN::vocab:pl-ru', reviewedAt: 2, clean: false }),
      log({ skillId: 'c|NOUN::vocab:pl-ru', reviewedAt: 3, correct: true, rating: 2 }), // старый
    ]
    expect(summarizeFirstAnswers(logs)).toEqual({ totalCount: 3, correctCount: 1 })
  })

  it('пустой список — нули', () => {
    expect(summarizeFirstAnswers([])).toEqual({ totalCount: 0, correctCount: 0 })
  })

  it('не мутирует вход', () => {
    const logs = [log({ reviewedAt: 2000 }), log({ reviewedAt: 1000 })]
    firstLogsBySkill(logs)
    expect(logs.map((l) => l.reviewedAt)).toEqual([2000, 1000])
  })
})

describe('dailyAccuracyPercent (§3)', () => {
  it('новые счётчики: accuracyClean / accuracyAttempts, а не correctCount / reviewsCount', () => {
    // Ошибка + верный повтор: reviewsCount 2, correctCount 1 (старая формула дала бы 50%).
    const day = stats({ reviewsCount: 2, correctCount: 1, accuracyAttempts: 1, accuracyClean: 0 })
    expect(dailyAccuracyPercent(day)).toBe(0)
  })

  it('чистый ответ — 100%', () => {
    expect(
      dailyAccuracyPercent(stats({ reviewsCount: 1, correctCount: 1, accuracyAttempts: 1, accuracyClean: 1 })),
    ).toBe(100)
  })

  it('округляет до целого процента', () => {
    expect(
      dailyAccuracyPercent(stats({ reviewsCount: 3, correctCount: 3, accuracyAttempts: 3, accuracyClean: 2 })),
    ).toBe(67)
  })

  it('день только со старыми счётчиками — прежняя формула', () => {
    expect(dailyAccuracyPercent(stats({ reviewsCount: 4, correctCount: 3 }))).toBe(75)
  })

  it('день без ответов и отсутствующая запись — null («—» на экране)', () => {
    expect(dailyAccuracyPercent(stats())).toBeNull()
    expect(dailyAccuracyPercent(undefined)).toBeNull()
  })
})
