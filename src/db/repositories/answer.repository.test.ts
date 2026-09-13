/**
 * `applyAnswer` tests (`spec/tasks/05-persistence.md` §5, acceptance point 4: "искусственный
 * сбой в середине не оставляет частичной записи").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import { applyAnswer, type AnswerInput } from './answer.repository.ts'
import type { ReviewLogRecord, SkillRecord, WordProgressRecord } from '@/types/progress.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

const SKILL_ID = 'kobieta|NOUN::vocab:pl-ru'
const WORD_ID = 'kobieta|NOUN'

// Noon UTC so the local-calendar-day bucket (`toLocalDateKey`, `applyAnswer`'s own file) is
// the same date regardless of which timezone this test runs in (up to +/-12h offsets).
const REVIEWED_AT = Date.UTC(2026, 8, 1, 12, 0, 0)
const REVIEWED_AT_LATER = REVIEWED_AT + 1000

function localDateKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const EXPECTED_DATE_KEY = localDateKey(REVIEWED_AT)

const BASE_SKILL: SkillRecord = {
  skillId: SKILL_ID,
  wordId: WORD_ID,
  kind: 'vocab',
  dimension: 'vocab:pl-ru',
  state: 'new',
  stability: 0,
  difficulty: 0,
  due: 0,
  reps: 0,
  lapses: 0,
  correct: 0,
  incorrect: 0,
  createdAt: 0,
  updatedAt: 0,
}

function makeInput(overrides: Partial<AnswerInput> = {}): AnswerInput {
  const reviewLog: Omit<ReviewLogRecord, 'id'> = {
    sessionId: 1,
    skillId: SKILL_ID,
    wordId: WORD_ID,
    exerciseType: 'translate',
    reviewedAt: REVIEWED_AT,
    rating: 3,
    correct: true,
    answerGiven: 'kobieta',
    expected: 'женщина',
    elapsedMs: 1200,
    srsApplied: true,
  }
  const nextWordProgress: WordProgressRecord = {
    wordId: WORD_ID,
    status: 'learning',
    vocabMaturity: 0.1,
    morphMaturity: 0,
    nextDue: REVIEWED_AT_LATER,
    updatedAt: REVIEWED_AT,
  }
  return {
    skillId: SKILL_ID,
    wordId: WORD_ID,
    kind: 'vocab',
    nextSrsState: {
      state: 'review',
      stability: 5,
      difficulty: 4,
      due: 6000,
      reps: 1,
      lapses: 0,
      lastReviewAt: REVIEWED_AT,
    },
    reviewLog,
    isNewSkill: true,
    nextWordProgress,
    ...overrides,
  }
}

describe('applyAnswer', () => {
  it('throws if the skill was never materialized via ensureSkill', async () => {
    await expect(applyAnswer(makeInput())).rejects.toThrow(/ensureSkill/)
    // Nothing at all should have been written.
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('writes skills + reviewLogs + wordProgress + dailyStats together on success', async () => {
    await db.skills.add(BASE_SKILL)

    await applyAnswer(makeInput())

    const skill = await db.skills.get(SKILL_ID)
    expect(skill?.state).toBe('review')
    expect(skill?.stability).toBe(5)
    expect(skill?.correct).toBe(1)
    expect(skill?.incorrect).toBe(0)

    const logs = await db.reviewLogs.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.answerGiven).toBe('kobieta')

    const progress = await db.wordProgress.get(WORD_ID)
    expect(progress?.status).toBe('learning')

    const stats = await db.dailyStats.get(EXPECTED_DATE_KEY)
    expect(stats?.reviewsCount).toBe(1)
    expect(stats?.correctCount).toBe(1)
    expect(stats?.newSkillsStarted).toBe(1)
    expect(stats?.timeSpentMs).toBe(1200)
  })

  it("srsApplied: false leaves the skill's SRS-facing fields untouched but still logs and counts", async () => {
    await db.skills.add(BASE_SKILL)

    await applyAnswer(
      makeInput({
        reviewLog: {
          sessionId: 1,
          skillId: SKILL_ID,
          wordId: WORD_ID,
          exerciseType: 'translate',
          reviewedAt: REVIEWED_AT,
          rating: 1,
          correct: false,
          answerGiven: 'kobita',
          expected: 'kobieta',
          elapsedMs: 800,
          srsApplied: false,
        },
      }),
    )

    const skill = await db.skills.get(SKILL_ID)
    // SRS fields stay exactly as BASE_SKILL — the damping rule (architecture.md §6.3).
    expect(skill?.state).toBe('new')
    expect(skill?.due).toBe(0)
    expect(skill?.reps).toBe(0)
    // Applied stats still move.
    expect(skill?.correct).toBe(0)
    expect(skill?.incorrect).toBe(1)

    const stats = await db.dailyStats.get(EXPECTED_DATE_KEY)
    expect(stats?.reviewsCount).toBe(1)
    expect(stats?.correctCount).toBe(0)
  })

  it('accumulates dailyStats across multiple answers on the same local day', async () => {
    await db.skills.add(BASE_SKILL)
    await applyAnswer(makeInput({ isNewSkill: true }))
    await applyAnswer(
      makeInput({
        isNewSkill: false,
        reviewLog: {
          sessionId: 1,
          skillId: SKILL_ID,
          wordId: WORD_ID,
          exerciseType: 'translate',
          reviewedAt: REVIEWED_AT_LATER,
          rating: 4,
          correct: true,
          answerGiven: 'kobieta',
          expected: 'kobieta',
          elapsedMs: 500,
          srsApplied: true,
        },
      }),
    )

    const stats = await db.dailyStats.get(EXPECTED_DATE_KEY)
    expect(stats?.reviewsCount).toBe(2)
    expect(stats?.correctCount).toBe(2)
    expect(stats?.newSkillsStarted).toBe(1)
    expect(stats?.timeSpentMs).toBe(1700)
  })

  it('is atomic: an injected failure after the skill write leaves NO partial write in any table', async () => {
    await db.skills.add(BASE_SKILL)

    // Force reviewLogs.add to throw mid-transaction, simulating e.g. a quota error that
    // strikes after `skills.put` has already been queued.
    const addSpy = vi.spyOn(db.reviewLogs, 'add').mockImplementation(() => {
      throw new Error('simulated failure mid-transaction')
    })

    await expect(applyAnswer(makeInput())).rejects.toThrow('simulated failure mid-transaction')
    addSpy.mockRestore()

    // The skill write that happened *before* the injected failure must have been rolled
    // back too — IndexedDB transactions are all-or-nothing.
    const skill = await db.skills.get(SKILL_ID)
    expect(skill?.state).toBe('new') // unchanged from BASE_SKILL, not 'review'
    expect(skill?.correct).toBe(0)

    expect(await db.reviewLogs.count()).toBe(0)
    expect(await db.wordProgress.get(WORD_ID)).toBeUndefined()
    expect(await db.dailyStats.count()).toBe(0)
  })

  it('is atomic: an injected failure on the LAST step (dailyStats) still rolls back the earlier writes', async () => {
    await db.skills.add(BASE_SKILL)

    const putSpy = vi.spyOn(db.dailyStats, 'put').mockImplementation(() => {
      throw new Error('simulated failure on last step')
    })

    await expect(applyAnswer(makeInput())).rejects.toThrow('simulated failure on last step')
    putSpy.mockRestore()

    const skill = await db.skills.get(SKILL_ID)
    expect(skill?.state).toBe('new')
    expect(await db.reviewLogs.count()).toBe(0)
    expect(await db.wordProgress.get(WORD_ID)).toBeUndefined()
    expect(await db.dailyStats.count()).toBe(0)
  })
})

describe('applyAnswer — correctStreak (task 40)', () => {
  it('increments correctStreak on a correct, srsApplied answer', async () => {
    await db.skills.add({ ...BASE_SKILL, correctStreak: 1 })
    await applyAnswer(makeInput())
    expect((await db.skills.get(SKILL_ID))?.correctStreak).toBe(2)
  })

  it('resets correctStreak to 0 on an incorrect, srsApplied answer', async () => {
    await db.skills.add({ ...BASE_SKILL, correctStreak: 4 })
    await applyAnswer(
      makeInput({
        reviewLog: {
          sessionId: 1,
          skillId: SKILL_ID,
          wordId: WORD_ID,
          exerciseType: 'translate',
          reviewedAt: REVIEWED_AT,
          rating: 1,
          correct: false,
          answerGiven: 'kobita',
          expected: 'kobieta',
          elapsedMs: 800,
          srsApplied: true,
        },
      }),
    )
    expect((await db.skills.get(SKILL_ID))?.correctStreak).toBe(0)
  })

  it('leaves correctStreak untouched when srsApplied is false, whatever the outcome', async () => {
    await db.skills.add({ ...BASE_SKILL, correctStreak: 3 })
    await applyAnswer(
      makeInput({
        reviewLog: {
          sessionId: 1,
          skillId: SKILL_ID,
          wordId: WORD_ID,
          exerciseType: 'translate',
          reviewedAt: REVIEWED_AT,
          rating: 1,
          correct: false,
          answerGiven: 'kobita',
          expected: 'kobieta',
          elapsedMs: 800,
          srsApplied: false,
        },
      }),
    )
    expect((await db.skills.get(SKILL_ID))?.correctStreak).toBe(3)
  })

  it('a row written before this field existed (undefined) reads as 0, then increments to 1', async () => {
    const legacySkill: SkillRecord = { ...BASE_SKILL }
    delete (legacySkill as { correctStreak?: number }).correctStreak
    await db.skills.add(legacySkill)
    await applyAnswer(makeInput())
    expect((await db.skills.get(SKILL_ID))?.correctStreak).toBe(1)
  })
})

describe('applyAnswer — cascadeSkills (task 40 §2)', () => {
  const LOWER_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-choice' as const
  const LOWER_SKILL: SkillRecord = {
    ...BASE_SKILL,
    skillId: LOWER_SKILL_ID,
    dimension: 'vocab:ru-pl-choice',
    state: 'review',
    stability: 5,
    due: REVIEWED_AT + 999_000,
    correct: 3,
    correctStreak: 1,
  }

  it('writes cascade skills in the same transaction as the primary skill', async () => {
    await db.skills.add(BASE_SKILL)
    const cascaded: SkillRecord = { ...LOWER_SKILL, correct: 4, correctStreak: 2 }
    await applyAnswer(makeInput({ cascadeSkills: [cascaded] }))
    expect(await db.skills.get(LOWER_SKILL_ID)).toEqual(cascaded)
  })

  it('does not create a reviewLogs row or bump dailyStats for a cascaded skill', async () => {
    await db.skills.add(BASE_SKILL)
    await applyAnswer(makeInput({ cascadeSkills: [LOWER_SKILL] }))
    expect(await db.reviewLogs.count()).toBe(1) // only skillId's own log
    const stats = await db.dailyStats.get(EXPECTED_DATE_KEY)
    expect(stats?.reviewsCount).toBe(1)
    expect(stats?.newSkillsStarted).toBe(1)
  })

  it('an injected failure still rolls back cascade writes along with everything else', async () => {
    await db.skills.add(BASE_SKILL)
    const addSpy = vi.spyOn(db.reviewLogs, 'add').mockImplementation(() => {
      throw new Error('simulated failure mid-transaction')
    })
    await expect(applyAnswer(makeInput({ cascadeSkills: [LOWER_SKILL] }))).rejects.toThrow(
      'simulated failure mid-transaction',
    )
    addSpy.mockRestore()
    expect(await db.skills.get(LOWER_SKILL_ID)).toBeUndefined()
  })
})
