/**
 * SRS damping policy (`spec/tasks/11-srs.md` §2-3, `spec/architecture.md` §6.2-6.3,
 * `spec/app-design.md` §17/§20/§24, requirements.md FR-103/FR-112).
 *
 * Two independent things live here:
 *  1. `mapResultToRating` — turns an exercise outcome into the FSRS rating the adapter
 *     should be called with (architecture.md §6.2's mapping table).
 *  2. The two damping rules (architecture.md §6.3) that keep SRS honest:
 *     - Rule 1 (in-session error repeat, FR-103) has no code *here* — it's enforced purely
 *       by the caller choosing `reviewLog.srsApplied` based on `firstAnswerBySkill` (session
 *       state, task 13) before calling `answer.repository.ts#applyAnswer`, which already
 *       gates `nextSrsState` on that flag. `shouldApplySrs` below is just a named,
 *       one-line restatement of that gate so task 13 doesn't have to inline
 *       `isFirstAnswerInSession` as a magic boolean at the call site.
 *     - Rule 2 (Practice mode, FR-112) is `capRatingForMode` + `applyPracticeDamping` below.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3). No
 * `ts-fsrs` import — only `fsrs-adapter.ts` may (architecture.md §6.1).
 */
import type { Rating, SessionMode } from '@/types/progress.ts'
import type { SrsState } from './srs.types.ts'

// ---------------------------------------------------------------------------
// Rating constants — named per the task's explicit instruction ("обе константы —
// именованные"), and reused by both the mapping below and this file's tests. Values match
// `ts-fsrs`'s `Rating` enum by construction (see `fsrs-adapter.ts`'s `review()` doc comment)
// but are declared here, not imported from `ts-fsrs` — this file must never import that
// package (architecture.md §6.1).
// ---------------------------------------------------------------------------
export const AGAIN: Rating = 1
export const HARD: Rating = 2
export const GOOD: Rating = 3
export const EASY: Rating = 4

// ---------------------------------------------------------------------------
// Step 2: exercise result -> Rating (architecture.md §6.2).
//
//   неверный ответ                            -> Again
//   верный, но nearMiss (ошибка в диакритике) -> Hard
//   верный, выбор из вариантов                -> Good
//   верный, ввод текста                       -> Easy
//   самооценка                                 -> рейтинг выбирает пользователь напрямую
//
// Deliberately NOT typed against `learning/exercises/exercise.types.ts#Exercise` or
// `grade.ts#GradeResult` (task 09) — task 11 depends only on 03 and 05, and importing task
// 09's types here would add an undeclared forward dependency in the wrong direction. Instead
// this takes the minimal shape the mapping table actually needs; task 13's session runner
// (which already has both a `GradeResult` and knows the exercise's `type`) adapts one into
// the other at the call site.
// ---------------------------------------------------------------------------

/** An auto-graded exercise's outcome — `choice` vs `input` per architecture.md §6.2's table
 *  ("выбор из вариантов" vs "ввод текста"); `form-choice`/`form-input` (task 09) count as
 *  `'choice'`/`'input'` respectively for this purpose, same distinction. */
export interface AutoGradedResult {
  readonly correct: boolean
  /** "Correct but for missing/wrong Polish diacritics" (`grade.ts#GradeResult.nearMiss`) —
   *  takes priority over `correct` in the mapping below: a near-miss is always `Hard`,
   *  regardless of `correct` (which `grade()` always reports `false` for a near-miss —
   *  the "почти верно" state is deliberately neither correct nor incorrect). */
  readonly nearMiss: boolean
  readonly answerKind: 'choice' | 'input'
}

/** The user picked their own rating directly (architecture.md §6.2, e.g. a `self-assess`
 *  exercise's "Знал / Не знал" buttons). */
export interface SelfAssessedResult {
  readonly rating: Rating
}

export type ExerciseGradeResult = AutoGradedResult | SelfAssessedResult

export function mapResultToRating(result: ExerciseGradeResult): Rating {
  if ('rating' in result) return result.rating
  if (result.nearMiss) return HARD
  if (!result.correct) return AGAIN
  return result.answerKind === 'choice' ? GOOD : EASY
}

// ---------------------------------------------------------------------------
// Rule 1 (FR-103) — named restatement of the session-state gate task 13 implements. Not
// exercising any FSRS/DB code itself; see this file's header.
// ---------------------------------------------------------------------------

/** Whether this answer's `nextSrsState` should be written to the skill's `SkillRecord`
 *  (i.e. `reviewLogs[i].srsApplied`). `isFirstAnswerInSession` is
 *  `!(skillId in sessionState.firstAnswerBySkill)` at the call site (task 13) — the first
 *  answer to a given skill within one session always applies; every later repeat of that
 *  same skill within the same session (typically "saw the correct answer, retried it 20s
 *  later") never does, no matter how the user answers it. */
export function shouldApplySrs(isFirstAnswerInSession: boolean): boolean {
  return isFirstAnswerInSession
}

// ---------------------------------------------------------------------------
// Rule 2 (FR-112) — Practice mode damping (architecture.md §6.3):
//   при mode === 'practice':
//     рейтинг не может быть выше Good
//     вычисленный интервал умножается на PRACTICE_INTERVAL_FACTOR (0.5)
// ---------------------------------------------------------------------------

/** The *interval* (`next.due - reviewedAt`) is scaled by this factor in Practice mode — not
 *  `stability`/`difficulty`, which stay whatever the adapter computed. Scaling only `due`
 *  means the next real review naturally arrives sooner (and FSRS will recompute a fresh,
 *  undamped stability/difficulty from the actual elapsed time at that point) without
 *  understating how well the skill is actually known. */
export const PRACTICE_INTERVAL_FACTOR = 0.5

/** Caps a rating at `Good` for Practice mode (architecture.md §6.3) — a self-chosen practice
 *  rep can raise confidence, but never as much as a scheduler-issued `Easy` review would. */
export function capRatingForMode(rating: Rating, mode: SessionMode): Rating {
  if (mode === 'practice' && rating > GOOD) return GOOD
  return rating
}

/** Scales the just-computed `next` SRS state's interval by `PRACTICE_INTERVAL_FACTOR` when
 *  `mode === 'practice'`; a no-op in `'learn'` mode. `reviewedAt` is the same `now` passed to
 *  `fsrs-adapter.ts#review()` that produced `next`. */
export function applyPracticeDamping(
  next: SrsState,
  mode: SessionMode,
  reviewedAt: number,
): SrsState {
  if (mode !== 'practice') return next
  const interval = next.due - reviewedAt
  const dampedInterval = Math.round(interval * PRACTICE_INTERVAL_FACTOR)
  return { ...next, due: reviewedAt + dampedInterval }
}
