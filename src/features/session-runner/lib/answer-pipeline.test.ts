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
import { ensureSkill, getSkill, upsertSkill } from '@/db/repositories/skills.repository.ts'
import { getWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import {
  CUED_RECALL_UNLOCK_STABILITY_DAYS,
  CUED_RECALL_UNLOCK_STREAK,
  PRODUCTION_UNLOCK_STREAK,
  RECOGNITION_UNLOCK_STABILITY_DAYS,
  RELEARN_RECOGNITION_STREAK,
} from '@/learning/progress/stage.ts'
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

// ---------------------------------------------------------------------------
// Task 29 (`spec/tasks/29-letter-by-letter-input.md` §3, FR-84/FR-85/FR-86): the
// letter-by-letter attempt's outcome (`LetterSlotsInput`) drives the rating instead of the
// plain "typed correctly -> Easy" rule, without changing what `grade()`/`GradeResult.correct`
// report for the same final string.
// ---------------------------------------------------------------------------

describe('submitAnswer — typed letter-by-letter attempts (задача 29)', () => {
  it('a clean attempt (no mistakes, no hints) still maps to Easy, same as before task 29', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    const result = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      attempt: { mistakes: 0, hintsUsed: 0, revealed: false, letterCount: 7 },
    })

    expect(result.gradeResult.correct).toBe(true)
    expect(result.rating).toBe(4) // EASY

    const logs = await getLogsForSession(1)
    expect(logs[0]).toMatchObject({ correct: true, rating: 4, answerGiven: 'женщина' })
  })

  it('a mistake or a hint caps the rating at Hard, even though the finished answer is correct', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    const result = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      attempt: { mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 7 },
    })

    // `grade()` still sees the final, fully-typed string — `correct` is unaffected by the
    // mistake made along the way (FR-86: the *rating*, not `GradeResult.correct`, carries
    // "assisted").
    expect(result.gradeResult.correct).toBe(true)
    expect(result.rating).toBe(2) // HARD, not AGAIN and not EASY

    const logs = await getLogsForSession(1)
    expect(logs[0]).toMatchObject({ correct: true, rating: 2, answerGiven: 'женщина' })
  })

  it('a revealed ("глазок") attempt maps to Again and logs only the confirmed prefix, not the full word', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    const result = await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'жен', // LetterSlotsInput#submittedAnswer's confirmed prefix, not 'женщина'
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      attempt: { mistakes: 0, hintsUsed: 0, revealed: true, letterCount: 7 },
    })

    expect(result.gradeResult.correct).toBe(false)
    expect(result.rating).toBe(1) // AGAIN

    const logs = await getLogsForSession(1)
    expect(logs[0]).toMatchObject({ correct: false, rating: 1, answerGiven: 'жен' })
  })
})

// ---------------------------------------------------------------------------
// Task 28 (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2, FR-80/FR-81),
// widened to a three-stage chain by task 37 (`spec/tasks/37-three-stage-vocabulary.md`
// §2): a stage's stability crossing its unlock bar (`progress/stage.ts`) materializes the
// next stage's skill — `vocab:pl-ru` -> `vocab:ru-pl-choice` -> `vocab:ru-pl-input`, none of
// which exist until then. Unlike task 28's original state-based gate, ONE correct answer is
// no longer enough — FSRS's stability only grows meaningfully across a real elapsed gap
// (same-day repeats don't move it at all, see `policy.ts` Rule 1's damping), so these tests
// advance `now` to the skill's own `due` between answers, same as a real user reviewing on
// schedule, rather than trying to fake a stability value directly.
// ---------------------------------------------------------------------------

describe('submitAnswer — открытие следующих этапов вокабуляра (task 37)', () => {
  const CUED_RECALL_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-choice'
  const PRODUCTION_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-input'

  async function answerSkill(
    skillId: string,
    overrides: Partial<Parameters<typeof submitAnswer>[0]> = {},
  ) {
    return submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      ...overrides,
    })
  }

  async function answerChoice(overrides: Partial<Parameters<typeof submitAnswer>[0]> = {}) {
    return answerSkill(SKILL_ID, overrides)
  }

  it('один верный ответ графадуирует узнавание в review, но стабильности ещё не хватает — этап 2 не открывается', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()

    await answerChoice()

    const afterFirst = (await getSkill(SKILL_ID))!
    expect(afterFirst.state).toBe('review')
    expect(afterFirst.stability).toBeLessThan(RECOGNITION_UNLOCK_STABILITY_DAYS)
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()
  })

  it('второй верный ответ по расписанию пересекает порог стабильности — открывается этап 2', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerChoice({ sessionId: 1, now: 1_000_000 })
    const afterFirst = (await getSkill(SKILL_ID))!

    await answerChoice({ sessionId: 2, now: afterFirst.due })
    const afterSecond = (await getSkill(SKILL_ID))!
    expect(afterSecond.stability).toBeGreaterThanOrEqual(RECOGNITION_UNLOCK_STABILITY_DAYS)

    const cuedRecall = await getSkill(CUED_RECALL_SKILL_ID)
    expect(cuedRecall).toBeDefined()
    expect(cuedRecall!.dimension).toBe('vocab:ru-pl-choice')
    expect(cuedRecall!.kind).toBe('vocab')
    // `due` в прошлом/настоящем: навык сразу «просрочен» и попадёт в ближайшую собранную
    // очередь — но не в текущую сессию, чья очередь уже построена целиком (FR-81).
    expect(cuedRecall!.state).toBe('new')
    // Этап 3 ещё не открыт — у только что созданного этапа 2 стабильность 0.
    expect(await getSkill(PRODUCTION_SKILL_ID)).toBeUndefined()
  })

  it('дальнейшие верные ответы по расписанию доводят слово до этапа 3', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerChoice({ sessionId: 1, now: 1_000_000 })
    const afterFirst = (await getSkill(SKILL_ID))!
    await answerChoice({ sessionId: 2, now: afterFirst.due })
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeDefined()

    // Этап 2 сам проходит ту же лестницу: первый ответ недостаточен...
    await answerSkill(CUED_RECALL_SKILL_ID, { sessionId: 3, now: afterFirst.due })
    const cuedAfterFirst = (await getSkill(CUED_RECALL_SKILL_ID))!
    expect(cuedAfterFirst.stability).toBeLessThan(CUED_RECALL_UNLOCK_STABILITY_DAYS)
    expect(await getSkill(PRODUCTION_SKILL_ID)).toBeUndefined()

    // ...второй, по расписанию, пересекает порог и открывает этап 3.
    await answerSkill(CUED_RECALL_SKILL_ID, { sessionId: 4, now: cuedAfterFirst.due })
    const production = await getSkill(PRODUCTION_SKILL_ID)
    expect(production).toBeDefined()
    expect(production!.dimension).toBe('vocab:ru-pl-input')
    expect(production!.kind).toBe('vocab')
    expect(production!.state).toBe('new')
  })

  it('неверный ответ на новый навык оставляет низкую стабильность — этап 2 не открывается', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await answerChoice({ answerGiven: 'мужчина' })

    expect((await getSkill(SKILL_ID))!.state).not.toBe('review')
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()
  })

  it('в режиме mistakes SRS не применяется — следующий этап не открывается', async () => {
    // `policy.ts#shouldApplySrs`: разбор ошибок вообще не двигает планировщик (FR-103), так
    // что графадуировать там нечего.
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await answerChoice({ mode: 'mistakes' })

    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()
  })

  it('Practice открывает следующий этап так же, как Learn — там SRS применяется, лишь демпфируется', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerChoice({ mode: 'practice', sessionId: 1, now: 1_000_000 })
    const afterFirst = (await getSkill(SKILL_ID))!

    await answerChoice({ mode: 'practice', sessionId: 2, now: afterFirst.due })

    expect((await getSkill(SKILL_ID))!.state).toBe('review')
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeDefined()
  })

  it('повторный верный ответ не пересоздаёт уже открытый навык', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerChoice({ sessionId: 1, now: 1_000_000 })
    const afterFirst = (await getSkill(SKILL_ID))!
    await answerChoice({ sessionId: 2, now: afterFirst.due })
    const first = await getSkill(CUED_RECALL_SKILL_ID)
    expect(first).toBeDefined()

    await answerChoice({ sessionId: 3, now: afterFirst.due + 1000 })
    const second = await getSkill(CUED_RECALL_SKILL_ID)
    expect(second!.createdAt).toBe(first!.createdAt)
    expect(second!.reps).toBe(0)
  })

  it('слово остаётся learning, пока не набрано ни разу успешно (FR-83)', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerChoice()

    const progress = await getWordProgress(WORD_ID)
    expect(progress!.status).toBe('learning')
  })
})

// ---------------------------------------------------------------------------
// Task 40 §1 (`spec/tasks/40-vocab-streak-progression.md`): streak-based unlock, independent
// of FSRS stability — two/three CONSECUTIVE correct answers, in separate sessions, close
// enough in time that `elapsed_days` rounds to 0 and stability genuinely never crosses the
// old task-37 bars. Proves the streak alone — not a lucky stability crossing — drives the
// unlock.
// ---------------------------------------------------------------------------

describe('submitAnswer — серия верных ответов подряд открывает этап без роста стабильности (task 40)', () => {
  const CUED_RECALL_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-choice'
  const PRODUCTION_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-input'

  async function answerSkill(
    skillId: string,
    overrides: Partial<Parameters<typeof submitAnswer>[0]> = {},
  ) {
    return submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      ...overrides,
    })
  }

  it(`${CUED_RECALL_UNLOCK_STREAK} верных ответа подряд, минуты друг за другом, открывают этап 2 — стабильность остаётся низкой`, async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await answerSkill(SKILL_ID, { sessionId: 1, now: 1_000_000 })
    await answerSkill(SKILL_ID, { sessionId: 2, now: 1_000_500 })

    const after = (await getSkill(SKILL_ID))!
    expect(after.correctStreak).toBe(CUED_RECALL_UNLOCK_STREAK)
    expect(after.stability).toBeLessThan(RECOGNITION_UNLOCK_STABILITY_DAYS)

    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeDefined()
  })

  it('ошибка между верными ответами сбрасывает серию — нужно накопить её заново', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')

    await answerSkill(SKILL_ID, { sessionId: 1, now: 1_000_000 }) // верно, streak=1
    await answerSkill(SKILL_ID, { sessionId: 2, now: 1_000_500, answerGiven: 'мужчина' }) // неверно, streak=0
    expect((await getSkill(SKILL_ID))!.correctStreak).toBe(0)
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()

    // Один верный ответ после сброса — этого мало, нужно два подряд заново.
    await answerSkill(SKILL_ID, { sessionId: 3, now: 1_001_000 })
    expect((await getSkill(SKILL_ID))!.correctStreak).toBe(1)
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()

    await answerSkill(SKILL_ID, { sessionId: 4, now: 1_001_500 })
    expect((await getSkill(SKILL_ID))!.correctStreak).toBe(2)
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeDefined()
  })

  it(`${PRODUCTION_UNLOCK_STREAK} верных ответа подряд на этапе 2 открывают ввод — стабильность остаётся низкой`, async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerSkill(SKILL_ID, { sessionId: 1, now: 1_000_000 })
    await answerSkill(SKILL_ID, { sessionId: 2, now: 1_000_500 })
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeDefined()

    await answerSkill(CUED_RECALL_SKILL_ID, { sessionId: 3, now: 1_001_000 })
    await answerSkill(CUED_RECALL_SKILL_ID, { sessionId: 4, now: 1_001_500 })
    expect(await getSkill(PRODUCTION_SKILL_ID)).toBeUndefined() // 2 из 3 — ещё рано

    await answerSkill(CUED_RECALL_SKILL_ID, { sessionId: 5, now: 1_002_000 })
    const cued = (await getSkill(CUED_RECALL_SKILL_ID))!
    expect(cued.correctStreak).toBe(PRODUCTION_UNLOCK_STREAK)
    expect(cued.stability).toBeLessThan(CUED_RECALL_UNLOCK_STABILITY_DAYS)
    expect(await getSkill(PRODUCTION_SKILL_ID)).toBeDefined()
  })

  it('mode: mistakes не двигает серию — этап не открывается даже после нескольких "верных" ответов', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await answerSkill(SKILL_ID, { mode: 'mistakes', sessionId: 1, now: 1_000_000 })
    await answerSkill(SKILL_ID, { mode: 'mistakes', sessionId: 2, now: 1_000_500 })
    expect((await getSkill(SKILL_ID))!.correctStreak).toBe(0)
    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Task 40 §2 ("один вопрос на слово за сессию"): a correct answer on the more advanced vocab
// stage also credits every less advanced one; an incorrect answer leaves them untouched; a
// revealed letter-by-letter attempt pulls their `due` back to "now" instead.
// ---------------------------------------------------------------------------

describe('submitAnswer — каскад на младшие этапы вокабуляра (task 40 §2)', () => {
  const CUED_RECALL_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-choice'
  const PRODUCTION_SKILL_ID = 'kobieta|NOUN::vocab:ru-pl-input'

  it('верный ответ на этап 2 засчитывается и на этап 1 — растёт correct/correctStreak, сдвигается due', async () => {
    const lower = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await ensureSkill(CUED_RECALL_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-choice')

    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: CUED_RECALL_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    const afterLower = (await getSkill(SKILL_ID))!
    expect(afterLower.correct).toBe(lower.correct + 1)
    expect(afterLower.correctStreak).toBe(1)
    expect(afterLower.due).not.toBe(lower.due)
    // Никакого reviewLog/dailyStats-приращения от каскада: только сам этап 2 был "отвечен".
    const logs = await getLogsForSession(1)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.skillId).toBe(CUED_RECALL_SKILL_ID)
  })

  it('неверный ответ на этап 2 не трогает этап 1 вовсе', async () => {
    const lower = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await ensureSkill(CUED_RECALL_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-choice')

    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: CUED_RECALL_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'мужчина', // неверно
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    expect(await getSkill(SKILL_ID)).toEqual(lower)
  })

  it('верный ответ на этап 3 (ввод) засчитывается на оба младших этапа', async () => {
    const lowerPlRu = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    const lowerChoice = await ensureSkill(
      CUED_RECALL_SKILL_ID,
      WORD_ID,
      'vocab',
      'vocab:ru-pl-choice',
    )
    await ensureSkill(PRODUCTION_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-input')

    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: PRODUCTION_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    expect((await getSkill(SKILL_ID))!.correct).toBe(lowerPlRu.correct + 1)
    expect((await getSkill(CUED_RECALL_SKILL_ID))!.correct).toBe(lowerChoice.correct + 1)
  })

  it('каскад не создаёт этап, которого ещё нет — только уже открытые младшие навыки', async () => {
    await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    // vocab:ru-pl-choice ещё не открыт (не ensureSkill'd) — как будто отвечен неверно, и
    // случайно проскочил через свайп-триаж. В реальности такое не должно случаться (этап 3
    // не может существовать без этапа 2), но проверяем, что каскад не падает и не создаёт
    // отсутствующие записи.
    await ensureSkill(PRODUCTION_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-input')

    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: PRODUCTION_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    expect(await getSkill(CUED_RECALL_SKILL_ID)).toBeUndefined()
  })

  it('"Показать слово" (revealed) на вводе возвращает due обоих младших этапов в "сейчас", не трогая их correct', async () => {
    const lowerPlRu = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    const lowerChoice = await ensureSkill(
      CUED_RECALL_SKILL_ID,
      WORD_ID,
      'vocab',
      'vocab:ru-pl-choice',
    )
    // Оба младших этапа "далеко в будущем" — типичное состояние для уже пройденного слова.
    const farFuture = 1_000_000 + 999 * 24 * 60 * 60 * 1000
    await ensureSkill(PRODUCTION_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-input')
    const db = await import('@/db/database.ts')
    await db.db.skills.update(SKILL_ID, { due: farFuture })
    await db.db.skills.update(CUED_RECALL_SKILL_ID, { due: farFuture })

    const now = 2_000_000
    await submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: PRODUCTION_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'жен', // confirmed prefix only, same shape as the real revealed case
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now,
      attempt: { mistakes: 0, hintsUsed: 0, revealed: true, letterCount: 7 },
    })

    const afterPlRu = (await getSkill(SKILL_ID))!
    const afterChoice = (await getSkill(CUED_RECALL_SKILL_ID))!
    expect(afterPlRu.due).toBe(now)
    expect(afterChoice.due).toBe(now)
    // Ничего кроме due не поменялось.
    expect(afterPlRu.correct).toBe(lowerPlRu.correct)
    expect(afterPlRu.correctStreak ?? 0).toBe(lowerPlRu.correctStreak ?? 0)
    expect(afterChoice.correct).toBe(lowerChoice.correct)
    expect(afterChoice.correctStreak ?? 0).toBe(lowerChoice.correctStreak ?? 0)
  })

  it('каскад в mode: mistakes не срабатывает (srsApplied всегда false там)', async () => {
    const lower = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await ensureSkill(CUED_RECALL_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-choice')

    await submitAnswer({
      sessionId: 1,
      mode: 'mistakes',
      exercise: CHOICE_EXERCISE,
      skillId: CUED_RECALL_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
    })

    expect(await getSkill(SKILL_ID)).toEqual(lower)
  })

  it('skipCascade подавляет каскад целиком — для явного двойного кредита (matching, task 39)', async () => {
    const lower = await ensureSkill(SKILL_ID, WORD_ID, 'vocab', 'vocab:pl-ru')
    await ensureSkill(CUED_RECALL_SKILL_ID, WORD_ID, 'vocab', 'vocab:ru-pl-choice')

    await submitAnswer({
      sessionId: 1,
      mode: 'practice',
      exercise: CHOICE_EXERCISE,
      skillId: CUED_RECALL_SKILL_ID,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 1_000_000,
      skipCascade: true,
    })

    expect(await getSkill(SKILL_ID)).toEqual(lower)
  })

  it('не-вocab навык (морфология) не запускает каскад', async () => {
    // Морфологический навык не участвует в vocab-каскаде вовсе — `buildVocabCascade` рано
    // возвращает `[]` по `skill.kind !== 'vocab'`, без падения на приведении dimension.
    const morphSkillId = 'kobieta|NOUN::noun:sg:genitive'
    await ensureSkill(morphSkillId, WORD_ID, 'noun', 'noun:sg:genitive')
    const formExercise: Exercise = {
      type: 'form-input',
      lemma: 'kobieta',
      hint: 'женщина',
      promptMode: 'lemma',
      slot: 'noun:sg:genitive',
      accepted: ['kobiety'],
    }

    await expect(
      submitAnswer({
        sessionId: 1,
        mode: 'learn',
        exercise: formExercise,
        skillId: morphSkillId,
        wordId: WORD_ID,
        kind: 'noun',
        answerGiven: 'kobiety',
        isFirstAnswerInSession: true,
        elapsedMs: 1000,
        now: 1_000_000,
      }),
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Task 43 (`spec/tasks/43-reveal-returns-to-recognition.md`): «Показать слово» на вводе
// возвращает слово к узнаванию — младшие этапы получают `due = now` и `correctStreak = 0`,
// ввод блокируется флагом `awaitingRecognition`, пока `vocab:ru-pl-choice` не наберёт
// `RELEARN_RECOGNITION_STREAK` верных подряд.
// ---------------------------------------------------------------------------

describe('submitAnswer — «Показать слово» возвращает к узнаванию (task 43)', () => {
  const PL_RU = 'kobieta|NOUN::vocab:pl-ru'
  const CHOICE = 'kobieta|NOUN::vocab:ru-pl-choice'
  const INPUT = 'kobieta|NOUN::vocab:ru-pl-input'
  const FAR_FUTURE = 1_000_000 + 999 * 24 * 60 * 60 * 1000

  /** Ввод, который уже повторяли по расписанию (FSRS-валидная запись `review`). */
  const REVIEWED_INPUT: Partial<SkillRecord> = {
    state: 'review',
    stability: 20,
    difficulty: 5,
    reps: 4,
    lastReviewAt: 900_000,
    due: FAR_FUTURE,
  }

  /** Слово на этапе 3: все три навыка есть, младшие далеко в будущем и с высокой серией. */
  async function seedProductionWord(inputOverrides: Partial<SkillRecord> = {}) {
    for (const [id, dimension] of [
      [PL_RU, 'vocab:pl-ru'],
      [CHOICE, 'vocab:ru-pl-choice'],
      [INPUT, 'vocab:ru-pl-input'],
    ] as const) {
      const fresh = await ensureSkill(id, WORD_ID, 'vocab', dimension)
      await upsertSkill({
        ...fresh,
        due: FAR_FUTURE,
        correct: 5,
        correctStreak: dimension === 'vocab:ru-pl-input' ? 0 : 5,
        ...(dimension === 'vocab:ru-pl-input' ? inputOverrides : {}),
      })
    }
  }

  function reveal(overrides: Partial<Parameters<typeof submitAnswer>[0]> = {}) {
    return submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: INPUT_EXERCISE,
      skillId: INPUT,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'жен',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 2_000_000,
      attempt: { mistakes: 0, hintsUsed: 0, revealed: true, letterCount: 7 },
      ...overrides,
    })
  }

  function answerChoice(overrides: Partial<Parameters<typeof submitAnswer>[0]> = {}) {
    return submitAnswer({
      sessionId: 1,
      mode: 'learn',
      exercise: CHOICE_EXERCISE,
      skillId: CHOICE,
      wordId: WORD_ID,
      kind: 'vocab',
      answerGiven: 'женщина',
      isFirstAnswerInSession: true,
      elapsedMs: 1000,
      now: 3_000_000,
      ...overrides,
    })
  }

  /** Слово после «Показать слово» в сессии 1 — ввод заблокирован, младшие этапы к повтору. */
  async function seedRevealedWord() {
    await seedProductionWord(REVIEWED_INPUT)
    await reveal()
  }

  describe('сам «Показать слово» (§1)', () => {
    it('младшие этапы получают due = now и correctStreak = 0, correct не трогается; ввод получает awaitingRecognition', async () => {
      await seedProductionWord()
      const now = 2_000_000

      await reveal({ now })

      for (const id of [PL_RU, CHOICE]) {
        const lower = (await getSkill(id))!
        expect(lower.due).toBe(now)
        expect(lower.correctStreak).toBe(0)
        expect(lower.correct).toBe(5)
      }
      const input = (await getSkill(INPUT))!
      expect(input.awaitingRecognition).toBe(true)
      // Собственный SRS-апдейт ввода (Again) остаётся как был: ошибка засчитана, интервал в минуты.
      expect(input.incorrect).toBe(1)
      expect(input.due).toBeGreaterThan(now)
      expect(input.due).toBeLessThan(now + 60 * 60 * 1000)
    })

    it('флаг ставится и без SRS (mode: mistakes, повтор внутри сессии) — это явный запрос «покажи снова», а не оценка', async () => {
      await seedProductionWord()
      await reveal({ mode: 'mistakes' })
      expect((await getSkill(INPUT))!.awaitingRecognition).toBe(true)

      await seedProductionWord()
      await reveal({ isFirstAnswerInSession: false, sessionId: 2 })
      const lower = (await getSkill(CHOICE))!
      expect(lower.correctStreak).toBe(0)
      expect((await getSkill(INPUT))!.awaitingRecognition).toBe(true)
    })

    it('без vocab:ru-pl-choice флаг не ставится — иначе ввод навсегда пропал бы из очереди: разблокировать его было бы нечем', async () => {
      // Ввод, открытый минуя этапы выбора (Practice/`skill`-scope через `ensureSkill`).
      await ensureSkill(INPUT, WORD_ID, 'vocab', 'vocab:ru-pl-input')
      await reveal()
      expect((await getSkill(INPUT))!.awaitingRecognition).toBeUndefined()
    })

    it('обычный (не revealed) неверный ответ на вводе флаг не ставит', async () => {
      await seedProductionWord()
      await reveal({
        answerGiven: 'zle',
        attempt: { mistakes: 3, hintsUsed: 0, revealed: false, letterCount: 7 },
      })
      expect((await getSkill(INPUT))!.awaitingRecognition).toBeUndefined()
      expect((await getSkill(CHOICE))!.correctStreak).toBe(5)
    })
  })

  describe('разблокировка серией узнаваний (§3)', () => {
    it(`${RELEARN_RECOGNITION_STREAK} верных ответа подряд на ru-pl-choice снимают флаг и ставят вводу due = now`, async () => {
      await seedRevealedWord()
      const before = (await getSkill(INPUT))!
      expect(before.awaitingRecognition).toBe(true)

      await answerChoice({ sessionId: 2, now: 3_000_000 })
      const afterFirst = (await getSkill(INPUT))!
      expect(afterFirst.awaitingRecognition).toBe(true) // 1 из 2 — ещё рано
      expect(afterFirst.due).toBe(before.due)

      await answerChoice({ sessionId: 3, now: 4_000_000 })
      const afterSecond = (await getSkill(INPUT))!
      expect((await getSkill(CHOICE))!.correctStreak).toBe(RELEARN_RECOGNITION_STREAK)
      expect('awaitingRecognition' in afterSecond).toBe(false)
      expect(afterSecond.due).toBe(4_000_000)
      // Остальное в записи ввода не тронуто: это не оценка, только снятие блокировки.
      expect(afterSecond.state).toBe(before.state)
      expect(afterSecond.stability).toBe(before.stability)
      expect(afterSecond.reps).toBe(before.reps)
      expect(afterSecond.correct).toBe(before.correct)
      expect(afterSecond.incorrect).toBe(before.incorrect)
    })

    it('снятие флага пишется в той же транзакции без собственного reviewLog: в журнале только ответы на ru-pl-choice', async () => {
      await seedRevealedWord()
      await answerChoice({ sessionId: 2, now: 3_000_000 })
      await answerChoice({ sessionId: 3, now: 4_000_000 })

      expect((await getLogsForSession(2)).map((l) => l.skillId)).toEqual([CHOICE])
      expect((await getLogsForSession(3)).map((l) => l.skillId)).toEqual([CHOICE])
    })

    it('ошибка между верными ответами обнуляет счёт — флаг остаётся, пока не набраны два подряд заново', async () => {
      await seedRevealedWord()

      await answerChoice({ sessionId: 2, now: 3_000_000 }) // 1
      await answerChoice({ sessionId: 3, now: 3_500_000, answerGiven: 'мужчина' }) // сброс
      expect((await getSkill(CHOICE))!.correctStreak).toBe(0)
      await answerChoice({ sessionId: 4, now: 4_000_000 }) // 1
      expect((await getSkill(INPUT))!.awaitingRecognition).toBe(true)

      await answerChoice({ sessionId: 5, now: 4_500_000 }) // 2
      expect('awaitingRecognition' in (await getSkill(INPUT))!).toBe(false)
    })

    it('верные ответы на vocab:pl-ru серию ru-pl-choice не наращивают и флаг не снимают', async () => {
      await seedRevealedWord()

      for (let session = 2; session <= 5; session++) {
        await submitAnswer({
          sessionId: session,
          mode: 'learn',
          exercise: CHOICE_EXERCISE,
          skillId: PL_RU,
          wordId: WORD_ID,
          kind: 'vocab',
          answerGiven: 'женщина',
          isFirstAnswerInSession: true,
          elapsedMs: 1000,
          now: 3_000_000 + session * 1000,
        })
      }

      expect((await getSkill(CHOICE))!.correctStreak).toBe(0)
      expect((await getSkill(INPUT))!.awaitingRecognition).toBe(true)
    })

    it('SRS не применён (mode: mistakes, повтор внутри сессии) — серия не движется, флаг не снимается, даже если серия уже на пороге', async () => {
      await seedRevealedWord()
      const choice = (await getSkill(CHOICE))!
      await upsertSkill({ ...choice, correctStreak: RELEARN_RECOGNITION_STREAK })

      await answerChoice({ sessionId: 2, mode: 'mistakes' })
      await answerChoice({ sessionId: 3, isFirstAnswerInSession: false })

      expect((await getSkill(INPUT))!.awaitingRecognition).toBe(true)
    })

    it('Practice тоже разблокирует: там SRS применяется (с демпфингом), серия растёт как в Learn', async () => {
      await seedRevealedWord()
      await answerChoice({ sessionId: 2, mode: 'practice', now: 3_000_000 })
      await answerChoice({ sessionId: 3, mode: 'practice', now: 4_000_000 })
      expect('awaitingRecognition' in (await getSkill(INPUT))!).toBe(false)
    })

    it('ввод без флага серия узнаваний не трогает: его due остаётся как был', async () => {
      await seedProductionWord(REVIEWED_INPUT)
      const choice = (await getSkill(CHOICE))!
      await upsertSkill({ ...choice, correctStreak: 0 })

      await answerChoice({ sessionId: 2, now: 3_000_000 })
      await answerChoice({ sessionId: 3, now: 4_000_000 })

      expect((await getSkill(INPUT))!.due).toBe(FAR_FUTURE)
    })

    it('skipCascade (сопоставление) серию узнаваний засчитывает так же: разблокировка не часть каскада', async () => {
      await seedRevealedWord()
      await answerChoice({ sessionId: 2, now: 3_000_000, skipCascade: true })
      await answerChoice({ sessionId: 3, now: 4_000_000, skipCascade: true })
      expect('awaitingRecognition' in (await getSkill(INPUT))!).toBe(false)
    })

    it('wordProgress.nextDue считается по тем же записям, что попали в БД, включая снятую блокировку ввода', async () => {
      await seedRevealedWord()
      await answerChoice({ sessionId: 2, now: 3_000_000 })
      await answerChoice({ sessionId: 3, now: 4_000_000 })

      const dues = await Promise.all(
        [PL_RU, CHOICE, INPUT].map(async (id) => (await getSkill(id))!.due),
      )
      expect((await getWordProgress(WORD_ID))?.nextDue).toBe(Math.min(...dues))
    })
  })
})
