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
 */
import { grade, type GradeResult } from '@/learning/exercises/grade.ts'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import {
  AGAIN,
  applyPracticeDamping,
  capRatingForMode,
  mapResultToRating,
  shouldApplySrs,
} from '@/learning/srs/policy.ts'
import { review } from '@/learning/srs/fsrs-adapter.ts'
import type { SrsState } from '@/learning/srs/srs.types.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import { applyAnswer } from '@/db/repositories/answer.repository.ts'
import { getSkill, getSkillsForWord } from '@/db/repositories/skills.repository.ts'
import { computeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import type { Rating, ReviewLogRecord, SessionMode, SkillKind, SkillRecord } from '@/types/progress.ts'

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

function answerKindOf(exercise: Exercise): 'choice' | 'input' {
  switch (exercise.type) {
    case 'choice':
    case 'form-choice':
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
function selfAssessGradeResult(exercise: Extract<Exercise, { type: 'self-assess' }>, rating: Rating): GradeResult {
  return { correct: rating !== AGAIN, nearMiss: false, matched: exercise.answer }
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
    rating = mapResultToRating({
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
    throw new Error(`submitAnswer: computeWordProgress("${wordId}") unexpectedly returned undefined`)
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
