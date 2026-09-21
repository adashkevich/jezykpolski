/**
 * The grade -> FSRS -> policy -> `applyAnswer` glue (`spec/tasks/13-session-runner.md`, the
 * task's central integration point). Every other task built one link of this chain in
 * isolation (09: `grade`/`generateExercise`; 11: `fsrs-adapter`/`policy`; 05: `applyAnswer`)
 * — this module is the first caller that actually wires all of them together end to end, on
 * the real, already-persisted `SkillRecord` for one graded answer.
 *
 * Rule 5 (task text: "ответ немедленно пишется в Dexie ДО показа фидбека"): `submitAnswer`
 * itself `await`s `applyAnswer` before returning the `GradeResult` the UI renders as
 * feedback — the caller (`SessionRunner.tsx`) only shows the feedback banner once this
 * promise resolves, so the Dexie write always lands strictly before the user sees an answer.
 *
 * Rule 6 (damping, `policy.ts`'s Rule 1): `isFirstAnswerInSession` is the caller's own
 * `firstAnswerBySkill` lookup — this module doesn't own that map (it lives in
 * `stores/session.store.ts`, per architecture.md §10), it only obeys the flag.
 *
 * Task 28 (`unlockNextVocabStage` below, FR-80/FR-81), widened to three stages by task 37,
 * and to a streak-based threshold by task 40 (`spec/tasks/40-vocab-streak-progression.md`
 * §1): this is also where the next vocabulary stage of a word is opened — a graded
 * `vocab:pl-ru` answer that clears its streak bar materializes `vocab:ru-pl-choice`, and a
 * graded `vocab:ru-pl-choice` answer that clears its own bar materializes
 * `vocab:ru-pl-input`, which is what puts "написать слово по-польски" into a later session's
 * queue at all.
 *
 * Task 40 §2 ("один вопрос на слово за сессию") adds a second, independent piece of logic
 * (`buildVocabCascade` below): a correct answer on a word's vocab skill also credits every
 * LESS advanced vocab skill of the same word (`lowerVocabDimensions`), and pressing "Показать
 * слово" on the input stage pulls those same lower skills' `due` back to "now" instead. Both
 * write through `applyAnswer`'s `cascadeSkills` — same transaction as the answered skill
 * itself, no `reviewLogs` row, no `dailyStats` bump (the user only answered ONE question).
 *
 * Task 43 (`spec/tasks/43-reveal-returns-to-recognition.md`) finishes the "Показать слово"
 * half: besides pulling the lower stages' `due` back, the reveal resets their `correctStreak`
 * to 0 and blocks the input stage itself (`SkillRecord.awaitingRecognition`, set through
 * `applyAnswer`'s `awaitingRecognition`); `buildRecognitionUnlock` below lifts that block again
 * once `vocab:ru-pl-choice` has been recognized `RELEARN_RECOGNITION_STREAK` times in a row.
 */
import { grade, type GradeResult } from '@/learning/exercises/grade.ts'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import {
  AGAIN,
  applyPracticeDamping,
  capRatingForMode,
  mapResultToRating,
  shouldApplySrs,
  type TypedAttemptResult,
} from '@/learning/srs/policy.ts'
import { review } from '@/learning/srs/fsrs-adapter.ts'
import type { SrsState } from '@/learning/srs/srs.types.ts'
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import {
  isAwaitingRecognition,
  lowerVocabDimensions,
  nextCorrectStreak,
  shouldLiftRecognitionLock,
  shouldUnlockCuedRecall,
  shouldUnlockProduction,
  withoutRecognitionLock,
} from '@/learning/progress/stage.ts'
import { encodeSkillId } from '@/learning/skills/skill-id.ts'
import { applyAnswer } from '@/db/repositories/answer.repository.ts'
import { ensureSkill, getSkill, getSkillsForWord } from '@/db/repositories/skills.repository.ts'
import { computeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import type {
  Rating,
  ReviewLogRecord,
  SessionMode,
  SkillKind,
  SkillRecord,
} from '@/types/progress.ts'

export interface SubmitAnswerInput {
  readonly sessionId: number
  readonly mode: SessionMode
  readonly exercise: Exercise
  readonly skillId: SkillId
  readonly wordId: WordId
  readonly kind: SkillKind
  /** The raw text the user typed/picked (`choice`/`input`/`form-*`), or, for `self-assess`,
   *  the chosen rating serialized as `'1' | '2' | '3'` (`SelfAssessExercise`'s own contract). */
  readonly answerGiven: string
  readonly isFirstAnswerInSession: boolean
  readonly elapsedMs: number
  readonly now: number
  /** The outcome of a letter-by-letter attempt (task 29, `LetterSlotsInput`) — only set for
   *  `input`/`form-input`. When present, the rating comes from it (mistakes/hints -> Hard,
   *  revealed -> Again) instead of the plain "typed correctly -> Easy" rule below. */
  readonly attempt?: TypedAttemptResult
  /**
   * Opts this call out of task 40 §2's "one question per word per session" cascade
   * (`buildVocabCascade` below). Set by `grade-matching-pair.ts`'s two sequential calls (one
   * per direction) — that caller already credits both `vocab:pl-ru` and
   * `vocab:ru-pl-choice` explicitly, itself, on purpose (task 39: the matching grid is
   * equally observable in both directions, so each earns its own `reviewLogs` row and its
   * own SRS review). Without this flag the second call's cascade would silently re-credit
   * the dimension the first call just explicitly answered, double-counting one match into
   * two `correct` increments on the lower stage.
   */
  readonly skipCascade?: boolean
}

export interface SubmitAnswerResult {
  readonly gradeResult: GradeResult
  /** The rating actually applied to `review()` — after Practice-mode capping. */
  readonly rating: Rating
  readonly correctAnswer: string
  /** Whether this was the very first time `skillId` was ever graded (any session, ever) —
   *  `applyAnswer`'s `isNewSkill`, handed back so the caller can tally session-summary
   *  "new words" vs "reviewed" counts without a second Dexie read. */
  readonly isNewSkill: boolean
}

/** Exported for `SessionRunner.tsx`'s `self-assess` interval preview, which needs the same
 *  `SkillRecord -> SrsState` view of the *current* skill this module already builds
 *  internally before calling `review()`. */
export function toSrsState(skill: SkillRecord): SrsState {
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

// Task 27's `context-sentence` is a pick-one-of-several UI, same as `choice`/`form-choice` —
// it reuses `mapResultToRating`'s existing `answerKind: 'choice'` FSRS-rating branch below
// rather than needing a kind of its own. (Its two Practice-only quiz siblings from the same
// task were removed by task 31 — FR-56/FR-57 cancelled.)
function answerKindOf(exercise: Exercise): 'choice' | 'input' {
  switch (exercise.type) {
    case 'choice':
    case 'form-choice':
    case 'context-sentence':
      return 'choice'
    case 'input':
    case 'form-input':
      return 'input'
    case 'self-assess':
    case 'table':
    case 'matching':
      throw new Error(`answerKindOf: exercise type "${exercise.type}" is not auto-graded`)
  }
}

/** The canonical correct answer to show in the feedback banner / log to `reviewLogs.expected`. */
export function correctAnswerOf(exercise: Exercise): string {
  switch (exercise.type) {
    case 'choice':
    case 'form-choice':
    case 'context-sentence':
      return exercise.correct
    case 'input':
    case 'form-input':
      return exercise.accepted[0]!
    case 'self-assess':
      return exercise.answer
    case 'table':
    case 'matching':
      throw new Error(`correctAnswerOf: exercise type "${exercise.type}" has no single answer`)
  }
}

/** Synthesizes a `GradeResult` for `self-assess` without calling `grade()` on the raw rating
 *  string — `grade()`'s `self-assess` branch compares the answer against `exercise.answer`
 *  (the word itself), which a `'1'|'2'|'3'` rating string would never match. "Correct" here
 *  means "rated better than Again" (Hard still counts — the user did recall it, just with
 *  difficulty), matching the 3-button `Не знаю / Трудно / Знаю` semantics in app-design §6. */
function selfAssessGradeResult(
  exercise: Extract<Exercise, { type: 'self-assess' }>,
  rating: Rating,
): GradeResult {
  return { correct: rating !== AGAIN, nearMiss: false, matched: exercise.answer }
}

/**
 * Task 28 (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2, FR-80/FR-81), widened
 * to a three-stage chain by task 37 (`spec/tasks/37-three-stage-vocabulary.md` §2) and to a
 * streak-based threshold by task 40 (`spec/tasks/40-vocab-streak-progression.md` §1) — opens
 * the next vocabulary stage for a word whose current stage just cleared its unlock bar: a
 * graded `vocab:pl-ru` answer that reaches `shouldUnlockCuedRecall` materializes
 * `vocab:ru-pl-choice` (узнавание по-польски), and a graded `vocab:ru-pl-choice` answer that
 * reaches `shouldUnlockProduction` materializes `vocab:ru-pl-input` (написать по-польски).
 * `ensureSkill` is idempotent, so re-answering an already-graduated skill is a cheap no-op
 * rather than a duplicate.
 *
 * The new record gets `due = now` (`ensureSkill`'s own default), i.e. it is immediately
 * overdue — but it still can't appear in the session the user is currently answering:
 * `useSessionBootstrap` resolves the whole queue up front, so the earliest the next stage can
 * show up is the next session. That's exactly FR-81's "прогрессия не проходится целиком за
 * одну сессию", enforced structurally instead of by a hard-coded delay.
 *
 * `srsApplied === false` (`mode: 'mistakes'`, or a repeat answer within one session —
 * `policy.ts#shouldApplySrs`) means neither `nextSrsState` nor `correctStreak` moved for this
 * answer, so promoting off them would be promoting off state that was never written.
 * Practice *does* apply SRS (capped and damped, `policy.ts` rule 2), so a Practice answer
 * that genuinely clears the streak bar opens the next stage exactly like a Learn one — the
 * skill really did earn it.
 */
async function unlockNextVocabStage(args: {
  readonly skill: SkillRecord
  readonly nextSrsState: SrsState
  readonly correct: boolean
  readonly srsApplied: boolean
  readonly wordId: WordId
}): Promise<void> {
  if (!args.srsApplied) return
  const updated: SkillRecord = {
    ...args.skill,
    ...args.nextSrsState,
    correctStreak: nextCorrectStreak(args.skill.correctStreak, args.correct, args.srsApplied),
  }

  if (args.skill.dimension === 'vocab:pl-ru') {
    if (!shouldUnlockCuedRecall(updated)) return
    await ensureSkill(
      encodeSkillId(args.wordId, 'vocab:ru-pl-choice'),
      args.wordId,
      'vocab',
      'vocab:ru-pl-choice',
    )
    return
  }

  if (args.skill.dimension === 'vocab:ru-pl-choice') {
    if (!shouldUnlockProduction(updated)) return
    await ensureSkill(
      encodeSkillId(args.wordId, 'vocab:ru-pl-input'),
      args.wordId,
      'vocab',
      'vocab:ru-pl-input',
    )
  }
}

/**
 * Task 40 §2 ("один вопрос на слово за сессию") — the vocab skills of `wordId` that are
 * LESS advanced than the one just answered (`otherWordSkills` may also contain more advanced
 * or morphological skills; only the strictly-lower vocab ones are touched), updated so the
 * next queue build never asks about the same word's translation a second time this session.
 *
 * Two independent branches, mutually exclusive (a revealed attempt always wins — see below):
 *
 *  - **Revealed** (`attempt.revealed`, "Показать слово"): pulls every lower stage's `due`
 *    back to "now" and zeroes its `correctStreak` (task 43 §1), nothing else — this is a
 *    request to see the translation again, not a graded review, so SRS fields/`correct`
 *    stay untouched. Not gated on `srsApplied`
 *    at all (unlike the branch below): it's idempotent (`due: now` twice is a no-op the
 *    second time) and should resurface the lower stages even on a `mistakes`-mode or
 *    in-session repeat reveal.
 *  - **Correct, SRS-applied**: every lower stage is credited with the SAME rating the
 *    answered skill got (`review()` + the same Practice damping), plus its own
 *    `correct`/`correctStreak` increment — exactly as if the user had separately answered
 *    that lower question correctly too.
 *
 * An incorrect (non-revealed) answer touches nothing here — task 40 §2's explicit rule:
 * mistakes on the advanced stage must not cost the word its already-earned lower stages, nor
 * their streaks.
 */
function buildVocabCascade(args: {
  readonly skill: SkillRecord
  readonly otherWordSkills: readonly SkillRecord[]
  readonly cappedRating: Rating
  readonly mode: SessionMode
  readonly correct: boolean
  readonly srsApplied: boolean
  readonly revealed: boolean
  readonly now: number
}): SkillRecord[] {
  if (args.skill.kind !== 'vocab') return []
  const lowerDims = new Set(lowerVocabDimensions(args.skill.dimension as VocabDimension))
  if (lowerDims.size === 0) return []
  const lowerSkills = args.otherWordSkills.filter((s) => lowerDims.has(s.dimension as VocabDimension))
  if (lowerSkills.length === 0) return []

  if (args.revealed) {
    // `correctStreak = 0` (task 43 §1): the streak left over from earlier successes would make
    // "how many times recognized since the failure" impossible to count.
    return lowerSkills.map((s) => ({ ...s, due: args.now, correctStreak: 0, updatedAt: args.now }))
  }

  if (!args.srsApplied || !args.correct) return []

  return lowerSkills.map((s) => {
    const { next } = review(toSrsState(s), args.cappedRating, args.now)
    const dampedNext = applyPracticeDamping(next, args.mode, args.now)
    return {
      ...s,
      ...dampedNext,
      correct: s.correct + 1,
      correctStreak: nextCorrectStreak(s.correctStreak, true, true),
      updatedAt: args.now,
    }
  })
}

/**
 * Task 43 §3 — lifts `vocab:ru-pl-input`'s `awaitingRecognition` lock once the word's
 * `vocab:ru-pl-choice` has reached `RELEARN_RECOGNITION_STREAK` correct answers in a row: the
 * input record loses the flag and gets `due = now`, nothing else about it changes (this is a
 * lock lift, not a review). Complements `unlockNextVocabStage` above — that one CREATES the
 * input record, this one only re-opens a record that a "Показать слово" blocked — and,
 * like it, does nothing when `srsApplied` is false (the streak did not move for this answer).
 * Independent of `skipCascade`: a matching-grid answer on `vocab:ru-pl-choice` is a real
 * recognition, and lifting the lock is not a cascade onto a lower stage. Returned as skill
 * rows for `applyAnswer`'s `cascadeSkills` (same transaction, no `reviewLog` of its own).
 *
 * The lock takes effect from the NEXT queue build: the current session's queue is already
 * assembled (`useSessionBootstrap`), so, like `unlockNextVocabStage`, this keeps FR-81.
 */
function buildRecognitionUnlock(args: {
  readonly answered: SkillRecord
  readonly updatedAnswered: SkillRecord
  readonly otherWordSkills: readonly SkillRecord[]
  readonly srsApplied: boolean
  readonly now: number
}): SkillRecord[] {
  if (!args.srsApplied) return []
  if (args.answered.kind !== 'vocab' || args.answered.dimension !== 'vocab:ru-pl-choice') return []
  if (!shouldLiftRecognitionLock(args.updatedAnswered)) return []
  const input = args.otherWordSkills.find((s) => s.dimension === 'vocab:ru-pl-input')
  if (input === undefined || !isAwaitingRecognition(input)) return []
  return [{ ...withoutRecognitionLock(input), due: args.now, updatedAt: args.now }]
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const { exercise, skillId, wordId, kind, mode, now, sessionId, elapsedMs, answerGiven } = input

  let gradeResult: GradeResult
  let rating: Rating
  if (exercise.type === 'self-assess') {
    const selfRating = Number(answerGiven) as Rating
    gradeResult = selfAssessGradeResult(exercise, selfRating)
    rating = mapResultToRating({ rating: selfRating })
  } else {
    gradeResult = grade(exercise, answerGiven)
    rating = input.attempt
      ? mapResultToRating(input.attempt)
      : mapResultToRating({
          correct: gradeResult.correct,
          nearMiss: gradeResult.nearMiss,
          answerKind: answerKindOf(exercise),
        })
  }

  const cappedRating = capRatingForMode(rating, mode)

  const currentSkill = await getSkill(skillId)
  if (!currentSkill) {
    throw new Error(`submitAnswer: no SkillRecord for "${skillId}" — was it ensureSkill'd?`)
  }

  const { next } = review(toSrsState(currentSkill), cappedRating, now)
  const dampedNext = applyPracticeDamping(next, mode, now)
  const srsApplied = shouldApplySrs(input.isFirstAnswerInSession, mode)

  // Mirrors architecture.md §5.2's lazy-materialization rule read backwards: a skill that
  // has never once been graded (regardless of *when* its SkillRecord row was created — could
  // be this exact call, via ensureSkill a moment earlier for a brand-new word, or an older
  // row that simply never got its first review) looks like this. Not derivable from
  // `ensureSkill`'s own return value alone, since a 'due' queue item's skill already existed
  // long before this call.
  const isNewSkill =
    currentSkill.reps === 0 && currentSkill.correct === 0 && currentSkill.incorrect === 0

  // Task 28, FR-80, widened by task 37/40: current stage cleared its bar -> открыть следующий.
  // Strictly before `getSkillsForWord` below, so the freshly created record is part of the
  // same `computeWordProgress` pass and the word's `stage` (`learning/progress/stage.ts`)
  // can't be one answer stale.
  await unlockNextVocabStage({
    skill: currentSkill,
    nextSrsState: dampedNext,
    correct: gradeResult.correct,
    srsApplied,
    wordId,
  })

  const updatedSkillForProgress: SkillRecord = {
    ...currentSkill,
    ...(srsApplied ? dampedNext : {}),
    correct: currentSkill.correct + (gradeResult.correct ? 1 : 0),
    incorrect: currentSkill.incorrect + (gradeResult.correct ? 0 : 1),
    correctStreak: nextCorrectStreak(currentSkill.correctStreak, gradeResult.correct, srsApplied),
    updatedAt: now,
  }

  const otherSkillsForWord = (await getSkillsForWord(wordId)).filter((s) => s.skillId !== skillId)

  // Task 40 §2 — "one question per word per session": credit (or resurface) the lower vocab
  // stages of this word so the next queue build doesn't ask about the same word's
  // translation twice. Computed from `otherSkillsForWord` (already fetched above) so the
  // aggregate below sees the SAME lower-stage values that get persisted, not the stale ones.
  const revealed = input.attempt?.revealed ?? false
  const cascadeSkills = [
    ...(input.skipCascade
      ? []
      : buildVocabCascade({
          skill: currentSkill,
          otherWordSkills: otherSkillsForWord,
          cappedRating,
          mode,
          correct: gradeResult.correct,
          srsApplied,
          revealed,
          now,
        })),
    // Task 43 §3: recognition streak reached -> the input stage stops being blocked.
    ...buildRecognitionUnlock({
      answered: currentSkill,
      updatedAnswered: updatedSkillForProgress,
      otherWordSkills: otherSkillsForWord,
      srsApplied,
      now,
    }),
  ]

  // Task 43 §1: "Показать слово" on the input stage blocks that stage itself until the word is
  // recognized again. Not gated on `srsApplied` (an explicit "show it again", like the lower
  // stages' `due` above) — but only when a `vocab:ru-pl-choice` record exists to unblock it:
  // an input opened without the recognition stages (Practice / single-skill scope) would
  // otherwise be hidden from the queue with nothing able to lift the block.
  const locksInput =
    revealed &&
    currentSkill.kind === 'vocab' &&
    currentSkill.dimension === 'vocab:ru-pl-input' &&
    otherSkillsForWord.some((s) => s.dimension === 'vocab:ru-pl-choice')
  const cascadeBySkillId = new Map(cascadeSkills.map((s) => [s.skillId, s]))
  const skillsForProgress = otherSkillsForWord.map((s) => cascadeBySkillId.get(s.skillId) ?? s)

  const nextWordProgress = await computeWordProgress(wordId, [
    ...skillsForProgress,
    updatedSkillForProgress,
  ])
  if (!nextWordProgress) {
    // Unreachable in practice — `updatedSkillForProgress` alone guarantees a non-empty
    // skill set for `wordId` (see `computeWordProgress`'s own doc comment) — but narrowing
    // explicitly here is cheaper than an assertion the type checker can't verify itself.
    throw new Error(
      `submitAnswer: computeWordProgress("${wordId}") unexpectedly returned undefined`,
    )
  }

  const correctAnswer = correctAnswerOf(exercise)
  const reviewLog: Omit<ReviewLogRecord, 'id'> = {
    sessionId,
    skillId,
    wordId,
    exerciseType: exercise.type,
    reviewedAt: now,
    rating: cappedRating,
    correct: gradeResult.correct,
    answerGiven,
    expected: correctAnswer,
    elapsedMs,
    srsApplied,
  }

  await applyAnswer({
    skillId,
    wordId,
    kind,
    nextSrsState: dampedNext,
    reviewLog,
    isNewSkill,
    nextWordProgress,
    cascadeSkills,
    ...(locksInput ? { awaitingRecognition: true as const } : {}),
  })

  return { gradeResult, rating: cappedRating, correctAnswer, isNewSkill }
}
