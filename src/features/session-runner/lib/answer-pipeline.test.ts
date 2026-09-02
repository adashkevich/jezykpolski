/**
 * `answer-pipeline.ts` (`spec/tasks/13-session-runner.md`) — the grade -> fsrs -> policy ->
 * `applyAnswer` glue. `toSrsState`/`correctAnswerOf` are pure and tested directly;
 * `submitAnswer` is the real integration point (task 11's `srs-rule1.integration.test.ts`
 * played out through the actual production caller instead of a hand-rolled `AnswerInput`),
 * so it's tested against a real (fake-indexeddb) database — same pattern as that file.
 *
 * Lives outside `src/db/**`, so (per `eslint.config.js`'s `no-restricted-imports`) it goes
 * through `lifecycle.repository.ts#openDatabase/deleteDatabase` rather than importing
 * `db/database.ts` directly — same convention `DatabaseProvider.test.tsx` already uses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { ensureSkill, getSkill } from '@/db/repositories/skills.repository.ts'
import { getWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { correctAnswerOf, submitAnswer, toSrsState } from './answer-pipeline.ts'

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    // -1 = "no paradigm" (task 02 §6) — sidesteps any network fetch for these vocab-only
    // tests, exactly like `paradigms.test.ts`'s own `getParadigm` "14 real words" case.
    paradigmShard: -1,
    ...overrides,
  }
}

const WORD_ID = 'kobieta|NOUN'
const SKILL_ID = 'kobieta|NOUN::vocab:pl-ru'

const CHOICE_EXERCISE: Exercise = {
  type: 'choice',
  direction: 'pl-ru',
  prompt: 'kobieta',
  options: ['женщина', 'мужчина'],
  correct: 'женщина',
}

const INPUT_EXERCISE: Exercise = {
  type: 'input',
  direction: 'pl-ru',
  prompt: 'kobieta',
  accepted: ['женщина'],
}

const SELF_ASSESS_EXERCISE: Exercise = {
  type: 'self-assess',
  prompt: 'kobieta',
  answer: 'женщина',
}

beforeEach(async () => {
  await openDatabase()
  __resetIndexStoreForTest()
  initIndexStore([entry({ lemma: 'kobieta', rank: 95, primaryRu: 'женщина' })])
})

afterEach(async () => {
  await deleteDatabase()
  __resetIndexStoreForTest()
})

// ---------------------------------------------------------------------------
// toSrsState — pure.
// ---------------------------------------------------------------------------

describe('toSrsState', () => {
  it('extracts exactly the 7 FSRS-facing fields from a SkillRecord', () => {
    const skill: SkillRecord = {
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 12.5,
      difficulty: 3.2,
      due: 1000,
      reps: 4,
      lapses: 1,
      lastReviewAt: 900,
      correct: 3,
      incorrect: 1,
      createdAt: 0,
      updatedAt: 900,
    }
    expect(toSrsState(skill)).toEqual({
      state: 'review',
      stability: 12.5,
      difficulty: 3.2,
      due: 1000,
      reps: 4,
      lapses: 1,
      lastReviewAt: 900,
    })
  })

  it('omits lastReviewAt for a never-reviewed skill (matches SrsState`s optional field)', () => {
    const skill: SkillRecord = {
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'new',
      stability: 0,
      difficulty: 0,
      due: 500,
      reps: 0,
      lapses: 0,
      correct: 0,
      incorrect: 0,
      createdAt: 500,
      updatedAt: 500,
    }
    expect(toSrsState(skill).lastReviewAt).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// correctAnswerOf — pure.
// ---------------------------------------------------------------------------

describe('correctAnswerOf', () => {
  it('choice/form-choice -> exercise.correct', () => {
    expect(correctAnswerOf(CHOICE_EXERCISE)).toBe('женщина')
    expect(
      correctAnswerOf({
        type: 'form-choice',
        lemma: 'kobieta',
        hint: 'женщина',
        promptMode: 'lemma',
        slot: 'noun:sg:genitive',
        options: ['kobiety', 'kobiecie'],
        correct: 'kobiety',
      }),
    ).toBe('kobiety')
  })

  it('input/form-input -> the FIRST accepted answer, not just any of them', () => {
    expect(correctAnswerOf({ ...INPUT_EXERCISE, accepted: ['женщина', 'дама'] })).toBe('женщина')
    expect(
      correctAnswerOf({
        type: 'form-input',
        lemma: 'kobieta',
        hint: 'женщина',
        promptMode: 'lemma',
        slot: 'noun:sg:genitive',
        accepted: ['kobiety', 'kobiecy'],
      }),
    ).toBe('kobiety')
  })

  it('self-assess -> exercise.answer', () => {
    expect(correctAnswerOf(SELF_ASSESS_EXERCISE)).toBe('женщина')
  })

  it('throws for table/matching — no single accepted answer to report', () => {
    expect(() => correctAnswerOf({ type: 'matching', pairs: [] })).toThrow()
    expect(() => correctAnswerOf({ type: 'table', lemma: 'kobieta', cells: [] })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// submitAnswer — the real integration: grade -> mapResultToRating -> review() ->
// applyPracticeDamping -> applyAnswer, against a real (fake-indexeddb) database.
// ---------------------------------------------------------------------------

describe('submitAnswer', () => {
  it('first answer: applies nextSrsState to the SkillRecord, logs srsApplied:true, isNewSkill:true, and recomputes nextWordProgress', async () => {
    const before = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    expect(before.state).toBe('new')
    expect(await getWordProgress(WORD_ID)).toBeUndefined() // nothing computed yet

    const result = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1500,
      now: 1_000_000,
    })

    expect(result.gradeResult.correct).toBe(true)
    expect(result.rating).toBe(3) // GOOD — "верный, выбор из вариантов" (architecture.md §6.2)
    expect(result.correctAnswer).toBe('женщина')
    expect(result.isNewSkill).toBe(true)

    // The FSRS-facing fields genuinely moved — proves `nextSrsState` (review()'s real
    // output, not a stub) was actually applied to the persisted SkillRecord.
    const after = await getSkill(SKILL_ID)
    expect(after).toBeDefined()
    expect(after!.state).not.toBe('new')
    expect(after!.reps).toBe(1)
    expect(after!.stability).toBeGreaterThan(0)
    expect(after!.due).not.toBe(before.due)
    expect(after!.correct).toBe(1)
    expect(after!.incorrect).toBe(0)

    const logs = await getLogsForSession(1)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      skillId: SKILL_ID,
      wordId: WORD_ID,
      exerciseType: 'choice',
      correct: true,
      rating: 3,
      srsApplied: true,
      answerGiven: 'женщина',
      expected: 'женщина',
    })

    // nextWordProgress was genuinely recomputed and persisted, not skipped/stubbed — a
    // fresh, never-reviewed word has 0 maturity, so a nonzero value here proves the write
    // reflects the just-applied review, not the pre-answer skill.
    const progress = await getWordProgress(WORD_ID)
    expect(progress).toBeDefined()
    expect(progress!.vocabMaturity).toBeGreaterThan(0)
    // `computeWordProgress` stamps its own `Date.now()` (not the `now` passed to
    // `submitAnswer`) — see `words-progress.repository.ts`; only its presence/recency
    // matters here, not an exact value.
    expect(progress!.updatedAt).toBeGreaterThan(0)
  })

  it('same-session repeat (isFirstAnswerInSession: false): SkillRecord FSRS fields stay frozen, but stats and reviewLogs still update (damping rule)', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })
    const afterFirst = await getSkill(SKILL_ID)

    const secondResult = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: false,
      elapsedMs: 800,
      now: 1_020_000,
    })

    // Already reviewed once by the first call above — never "new" on this second call.
    expect(secondResult.isNewSkill).toBe(false)

    const afterSecond = await getSkill(SKILL_ID)
    expect(afterSecond).toBeDefined()
    expect(afterSecond!.state).toBe(afterFirst!.state)
    expect(afterSecond!.stability).toBe(afterFirst!.stability)
    expect(afterSecond!.difficulty).toBe(afterFirst!.difficulty)
    expect(afterSecond!.due).toBe(afterFirst!.due)
    expect(afterSecond!.reps).toBe(afterFirst!.reps)
    expect(afterSecond!.lapses).toBe(afterFirst!.lapses)
    expect(afterSecond!.lastReviewAt).toBe(afterFirst!.lastReviewAt)
    // Applied stats (correct/incorrect) are NOT gated by srsApplied — applyAnswer bumps
    // them unconditionally (see that file's own implementation).
    expect(afterSecond!.correct).toBe(afterFirst!.correct + 1)

    const logs = await getLogsForSession(1)
    expect(logs).toHaveLength(2)
    expect(logs[1]).toMatchObject({ srsApplied: false, correct: true })
  })

  it('isNewSkill is false for a skill with prior review history, even in a brand-new session', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    // A later, independent session (different sessionId) — still not "new": the skill was
    // graded before, just not in *this* session.
    const laterResult = await submitAnswer({
      sessionId: 2,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 90_000_000,
    })
    expect(laterResult.isNewSkill).toBe(false)
  })

  it('an incorrect choice answer maps to Again and is reflected in correct:false / incorrect count', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    const result = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'мужчина',
      isFirstAnswerInSession: true,
      elapsedMs: 2000,
      now: 1_000_000,
    })
    expect(result.gradeResult.correct).toBe(false)
    expect(result.rating).toBe(1) // AGAIN

    const after = await getSkill(SKILL_ID)
    expect(after!.correct).toBe(0)
    expect(after!.incorrect).toBe(1)
  })

  it('self-assess: uses the user-picked rating directly, never calls grade() against the raw rating string', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    const hard = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: SELF_ASSESS_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: '2', // "Трудно" = Hard
      isFirstAnswerInSession: true,
      elapsedMs: 3000,
      now: 1_000_000,
    })
    expect(hard.rating).toBe(2)
    // Hard still counts as "recalled" for stats purposes (this module's own documented rule).
    expect(hard.gradeResult.correct).toBe(true)
    expect(hard.correctAnswer).toBe('женщина')
  })

  it('self-assess "Не знаю" (Again) is reported as incorrect', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    const again = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: SELF_ASSESS_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: '1',
      isFirstAnswerInSession: true,
      elapsedMs: 3000,
      now: 1_000_000,
    })
    expect(again.rating).toBe(1)
    expect(again.gradeResult.correct).toBe(false)
  })

  it('practice mode caps the rating at Good even where learn mode would grant Easy (rule 2, FR-112)', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    // Sanity check first: the same exact input, in 'learn' mode, is Easy (4) — "верный, ввод
    // текста" (architecture.md §6.2) — so the practice-mode assertion below is a real cap,
    // not just what the mapping would have produced anyway. `capRatingForMode` only depends
    // on `mode`, so re-using the same skill/word across two independent sessions (2nd call
    // is `isFirstAnswerInSession: true` for session 2) isolates exactly that one variable.
    const learnResult = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1200,
      now: 1_000_000,
    })
    expect(learnResult.rating).toBe(4)

    const practiceResult = await submitAnswer({
      sessionId: 2,
      mode: 'practice',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1200,
      now: 90_000_000,
    })
    expect(practiceResult.rating).toBe(3) // capped from Easy(4) to Good(3)
  })

  it('mistakes mode: SkillRecord FSRS fields never move, even for a correct free-text (Easy-mapped) answer on the very first answer of the "session" (task 14, FR-103)', async () => {
    const before = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    const result = await submitAnswer({
      sessionId: 1,
      mode: 'mistakes',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      // Deliberately `true` — a mistakes-review is always this skill's first (and only)
      // answer within that "session", so this is the realistic call shape. The point of
      // the test is that `shouldApplySrs` ignores it entirely for this mode.
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    // Not capped (capRatingForMode only special-cases 'practice') — the *rating* recorded is
    // the real Easy, only the FSRS write is suppressed.
    expect(result.rating).toBe(4)
    expect(result.gradeResult.correct).toBe(true)

    const after = await getSkill(SKILL_ID)
    expect(after).toBeDefined()
    // Every FSRS-facing field is byte-for-byte unchanged from the freshly-ensured skill.
    expect(after!.state).toBe(before.state)
    expect(after!.stability).toBe(before.stability)
    expect(after!.difficulty).toBe(before.difficulty)
    expect(after!.due).toBe(before.due)
    expect(after!.reps).toBe(before.reps)
    expect(after!.lapses).toBe(before.lapses)
    expect(after!.lastReviewAt).toBe(before.lastReviewAt)
    // Applied stats still move (same "independent of FSRS state" rule as any in-session
    // repeat) — mistakes mode isn't a no-op write, just a no-SRS-credit one.
    expect(after!.correct).toBe(before.correct + 1)

    const logs = await getLogsForSession(1)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ srsApplied: false, correct: true, rating: 4 })
  })

  it('mistakes mode: an incorrect (Again-mapped) answer also leaves the SkillRecord untouched', async () => {
    const before = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await submitAnswer({
      sessionId: 1,
      mode: 'mistakes',
      exercise: CHOICE_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'мужчина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    const after = await getSkill(SKILL_ID)
    expect(after!.due).toBe(before.due)
    expect(after!.reps).toBe(before.reps)
    expect(after!.incorrect).toBe(before.incorrect + 1)

    const logs = await getLogsForSession(1)
    expect(logs[0]).toMatchObject({ srsApplied: false, correct: false })
  })
})
