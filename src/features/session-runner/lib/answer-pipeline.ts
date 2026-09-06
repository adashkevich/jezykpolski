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
 * Task 28 (`unlockProductionStage` below, FR-80/FR-81): this is also where этап 2 of a word
 * is opened — a graded `vocab:pl-ru` answer that graduates узнавание materializes the
 * `vocab:ru-pl` skill, which is what puts "написать слово по-польски" into a later session's
 * queue at all.
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
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import { shouldUnlockProduction } from '@/learning/progress/stage.ts'
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
 * Task 28 (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2, FR-80/FR-81) — opens
 * этап 2 for a word whose узнавание (`vocab:pl-ru`) just graduated: materializes
 * `vocab:ru-pl` so the scheduler can hand out "напиши по-польски" at all. `ensureSkill` is
 * idempotent, so re-answering an already-graduated `vocab:pl-ru` is a cheap no-op rather
 * than a duplicate.
 *
 * The new record gets `due = now` (`ensureSkill`'s own default), i.e. it is immediately
 * overdue — but it still can't appear in the session the user is currently answering:
 * `useSessionBootstrap` resolves the whole queue up front, so the earliest этап 2 can show
 * up is the next session. That's exactly FR-81's "прогрессия не проходится целиком за одну
 * сессию", enforced structurally instead of by a hard-coded delay.
 *
 * `srsApplied === false` (`mode: 'mistakes'`, or a repeat answer within one session —
 * `policy.ts#shouldApplySrs`) means `nextSrsState` was never written, so promoting off it
 * would be promoting off a state that doesn't exist. Practice *does* apply SRS (capped and
 * damped, `policy.ts` rule 2), so a Practice answer that genuinely graduates узнавание opens
 * этап 2 exactly like a Learn one — the skill really did reach `review`.
 */
async function unlockProductionStage(args: {
  readonly skill: SkillRecord
  readonly nextSrsState: SrsState
  readonly srsApplied: boolean
  readonly wordId: WordId
}): Promise<void> {
  if (!args.srsApplied) return
  if (args.skill.dimension !== 'vocab:pl-ru') return
  if (!shouldUnlockProduction({ ...args.skill, ...args.nextSrsState })) return

  await ensureSkill(
    encodeSkillId(args.wordId, 'vocab:ru-pl'),
    args.wordId,
    'vocab',
    'vocab:ru-pl',
  )
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

  // Task 28, FR-80: этап 1 пройден -> открыть этап 2. Strictly before `getSkillsForWord`
  // below, so the freshly created `vocab:ru-pl` record is part of the same
  // `computeWordProgress` pass and the word's `stage` (`learning/progress/stage.ts`) can't
  // be one answer stale.
  await unlockProductionStage({
    skill: currentSkill,
    nextSrsState: dampedNext,
    srsApplied,
    wordId,
  })

  const updatedSkillForProgress: SkillRecord = {
    ...currentSkill,
    ...(srsApplied ? dampedNext : {}),
    correct: currentSkill.correct + (gradeResult.correct ? 1 : 0),
    incorrect: currentSkill.incorrect + (gradeResult.correct ? 0 : 1),
    updatedAt: now,
  }

  const otherSkillsForWord = (await getSkillsForWord(wordId)).filter((s) => s.skillId !== skillId)
  const nextWordProgress = await computeWordProgress(wordId, [
    ...otherSkillsForWord,
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
  })

  return { gradeResult, rating: cappedRating, correctAnswer, isNewSkill }
}
