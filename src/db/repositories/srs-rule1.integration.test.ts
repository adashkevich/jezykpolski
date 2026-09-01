/**
 * Rule 1 (in-session error repeat, FR-103) end-to-end, wiring together the pieces the task
 * text asks for (`spec/tasks/11-srs.md` §3, acceptance point 6):
 *
 *   "вызови applyAnswer дважды с одним skillId, второй раз с srsApplied: false, проверь что
 *   SkillRecord не изменился после второго вызова, а reviewLogs содержит обе записи."
 *
 * This is the actual task-13 integration shape spelled out end-to-end: `ensureSkill` (task
 * 05) materializes the skill, `fsrs-adapter.ts#review()` (task 11) computes the next FSRS
 * state from the skill's current `SrsState`, `policy.ts#mapResultToRating` (task 11) turns
 * the exercise outcome into the rating passed to `review()`, and
 * `answer.repository.ts#applyAnswer` (task 05) does the actual write — gating whether
 * `nextSrsState` lands in `skills` on `reviewLog.srsApplied`, exactly as `policy.ts#
 * shouldApplySrs` names it. Task 13 (not built yet) will be the real caller that decides
 * `srsApplied` from `firstAnswerBySkill` in its session state; here the test plays that
 * role directly since there is no session state to consult yet.
 *
 * Lives under `src/db/repositories/` (not `src/learning/**`) specifically so it may import
 * `db` from `@/db/database.ts` directly to seed/inspect tables — `eslint.config.js`'s
 * `no-restricted-imports` only exempts `src/db/**` from that ban (`src/learning/**` is
 * banned from it precisely because it's supposed to be a pure domain layer, architecture.md
 * §3). The `@/learning/srs/**` imports below (task 11's own modules) are fine either way —
 * nothing bans `src/db/**` from importing `learning/**`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { applyAnswer, type AnswerInput } from './answer.repository.ts'
import { ensureSkill, getSkill } from './skills.repository.ts'
import type { ReviewLogRecord, SkillRecord, WordProgressRecord } from '@/types/progress.ts'
import { review } from '@/learning/srs/fsrs-adapter.ts'
import { mapResultToRating, shouldApplySrs } from '@/learning/srs/policy.ts'
import type { SrsState } from '@/learning/srs/srs.types.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

const SKILL_ID = 'kobieta|NOUN::vocab:pl-ru'
const WORD_ID = 'kobieta|NOUN'
const FIRST_ANSWER_AT = Date.UTC(2026, 8, 1, 12, 0, 0)
const REPEAT_ANSWER_AT = FIRST_ANSWER_AT + 20_000 // "через 20 секунд"

function toSrsState(skill: SkillRecord): SrsState {
  return {
    state: skill.state,
    stability: skill.stability,
    difficulty: skill.difficulty,
    due: skill.due,
    reps: skill.reps,
    lapses: skill.lapses,
    lastReviewAt: skill.lastReviewAt,
  }
}

function fakeWordProgress(updatedAt: number): WordProgressRecord {
  // Not under test here — computeWordProgress (task 05) needs the content layer loaded,
  // which this unit test deliberately doesn't pull in. Any well-formed row satisfies
  // applyAnswer's transaction.
  return { wordId: WORD_ID, status: 'learning', vocabMaturity: 0.1, morphMaturity: 0, updatedAt }
}

/** Builds the `AnswerInput` a real caller (task 13) would produce for one graded answer,
 *  given whether this is the first answer to `SKILL_ID` in the session. */
function buildAnswerInput(args: {
  skill: SkillRecord
  reviewedAt: number
  isFirstAnswerInSession: boolean
}): AnswerInput {
  const { skill, reviewedAt, isFirstAnswerInSession } = args
  const rating = mapResultToRating({ correct: true, nearMiss: false, answerKind: 'input' })
  expect(rating).toBe(4) // EASY — "верный, ввод текста" (architecture.md §6.2)
  const { next } = review(toSrsState(skill), rating, reviewedAt)
  const srsApplied = shouldApplySrs(isFirstAnswerInSession)

  const reviewLog: Omit<ReviewLogRecord, 'id'> = {
    sessionId: 1,
    skillId: SKILL_ID,
    wordId: WORD_ID,
    exerciseType: 'input',
    reviewedAt,
    rating,
    correct: true,
    answerGiven: 'kobieta',
    expected: 'женщина',
    elapsedMs: 1500,
    srsApplied,
  }

  return {
    skillId: SKILL_ID,
    wordId: WORD_ID,
    kind: 'vocab',
    nextSrsState: next,
    reviewLog,
    isNewSkill: isFirstAnswerInSession,
    nextWordProgress: fakeWordProgress(reviewedAt),
  }
}

describe('Rule 1 (FR-103): in-session error/success repeat does not re-apply SRS', () => {
  it('the 2nd answer to the same skill in one session is logged but leaves the FSRS state untouched', async () => {
    const skill = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    expect(skill.state).toBe('new')

    // --- 1st answer: user got it right the first time. srsApplied: true. ---
    await applyAnswer(
      buildAnswerInput({ skill, reviewedAt: FIRST_ANSWER_AT, isFirstAnswerInSession: true }),
    )

    const afterFirst = await getSkill(SKILL_ID)
    expect(afterFirst).toBeDefined()
    // review() actually moved the schedule: no longer the untouched "new" defaults.
    expect(afterFirst!.reps).toBe(1)
    expect(afterFirst!.due).not.toBe(skill.due)

    // --- 2nd answer: same skill, same session, 20s later — e.g. the "review mistakes"
    // screen re-showing this item, or simply an accidental double-submit. srsApplied: false. ---
    await applyAnswer(
      buildAnswerInput({
        skill: afterFirst!,
        reviewedAt: REPEAT_ANSWER_AT,
        isFirstAnswerInSession: false,
      }),
    )

    const afterSecond = await getSkill(SKILL_ID)
    expect(afterSecond).toBeDefined()

    // The FSRS-facing fields (what fsrs-adapter.ts#review() computes) must be byte-identical
    // to their post-1st-answer values — the 2nd call's `nextSrsState` was computed but never
    // applied, exactly as `AnswerInput.nextSrsState`'s doc comment specifies.
    expect(afterSecond!.state).toBe(afterFirst!.state)
    expect(afterSecond!.stability).toBe(afterFirst!.stability)
    expect(afterSecond!.difficulty).toBe(afterFirst!.difficulty)
    expect(afterSecond!.due).toBe(afterFirst!.due)
    expect(afterSecond!.reps).toBe(afterFirst!.reps)
    expect(afterSecond!.lapses).toBe(afterFirst!.lapses)
    expect(afterSecond!.lastReviewAt).toBe(afterFirst!.lastReviewAt)

    // Both attempts are nonetheless in reviewLogs, second one flagged srsApplied: false.
    const logs = await db.reviewLogs.where('skillId').equals(SKILL_ID).sortBy('reviewedAt')
    expect(logs).toHaveLength(2)
    expect(logs[0]?.reviewedAt).toBe(FIRST_ANSWER_AT)
    expect(logs[0]?.srsApplied).toBe(true)
    expect(logs[1]?.reviewedAt).toBe(REPEAT_ANSWER_AT)
    expect(logs[1]?.srsApplied).toBe(false)
  })
})
