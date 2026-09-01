/**
 * SRS domain types (`spec/tasks/11-srs.md` §1, `spec/architecture.md` §6.1).
 *
 * `SrsState` is the application's own FSRS-facing state — field-for-field the same subset
 * `SkillRecord` carries (`types/progress.ts`) and exactly what
 * `db/repositories/answer.repository.ts#AnswerInput.nextSrsState` expects, so a caller can
 * pass `fsrs-adapter.ts#review()`'s `next` straight through without reshaping it. No
 * `ts-fsrs` type (`Card`, `State`, `Grade`, ...) appears anywhere in this file — that's the
 * whole point of the adapter boundary (architecture.md §6.1): only `fsrs-adapter.ts` is
 * allowed to know `ts-fsrs` exists.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { Rating, SkillState } from '@/types/progress.ts'

export interface SrsState {
  readonly state: SkillState
  readonly stability: number
  readonly difficulty: number
  /** epoch ms — never `Date` (task 11 hard rule 4; indexed/serialized as a number). */
  readonly due: number
  readonly reps: number
  readonly lapses: number
  /** epoch ms; absent before the first-ever review. */
  readonly lastReviewAt?: number
}

/**
 * What `fsrs-adapter.ts#review()` hands back alongside the next `SrsState`. Distinct from
 * `types/progress.ts#ReviewLogRecord` — that's the persisted row a session runner (task 13)
 * builds (it also carries `answerGiven`/`expected`/`elapsedMs`, which the adapter has no way
 * to know); this is just the FSRS-scheduling facts about one review, useful for debugging/
 * analytics without re-deriving them from a `SkillRecord` diff.
 */
export interface SrsLogEntry {
  readonly rating: Rating
  /** epoch ms — the `now` passed into `review()`. */
  readonly reviewedAt: number
  readonly previousState: SkillState
  readonly nextState: SkillState
  /** Whole days between `next.due` and `reviewedAt`, rounded — 0 for a same-day (re)learning step. */
  readonly scheduledDays: number
  /** Whole days since the previous review, or 0 for a card's first-ever review. */
  readonly elapsedDays: number
}
