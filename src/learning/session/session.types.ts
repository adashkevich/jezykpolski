/**
 * Session-queue domain types (`spec/tasks/13-session-runner.md` §1, `spec/architecture.md`
 * §10). Split out from `build-learn-queue.ts` itself so a future `build-practice-queue.ts`
 * (task 19, explicitly out of this task's scope) can produce/consume the same `QueuePlan`
 * shape without importing `build-learn-queue.ts`'s own module (which would otherwise be the
 * only place `QueuePlanItem` was declared).
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3) — same rule
 * as every other `src/learning/**` file.
 */
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type { Rating, SkillRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'

/**
 * One slot in a built queue, before any exercise has been generated for it. Two shapes:
 *
 *  - `'due'` — an already-materialized skill whose `due` has passed (or which is mid
 *    learning/relearning) — the caller already has its `SkillRecord`, no `ensureSkill` call
 *    needed before generating its exercise.
 *  - `'new'` — a word the learner hasn't started yet. Carries the `WordIndexEntry`, not a
 *    `SkillRecord` (none exists) — task text rule 4: only `vocab:pl-ru` gets materialized
 *    for it, and only once this item is actually about to be turned into an exercise (lazy,
 *    same spirit as architecture.md §5.2's lazy materialization — a word merely *offered* as
 *    a queue candidate must not gain a `SkillRecord` before the learner actually reaches it,
 *    e.g. if the session is abandoned before this item is ever shown).
 */
export type LearnQueueItem =
  | { readonly source: 'due'; readonly skill: SkillRecord }
  | { readonly source: 'new'; readonly word: WordIndexEntry; readonly wordId: WordId }

export interface QueuePlan {
  readonly items: readonly LearnQueueItem[]
}

/**
 * One graded attempt, as `stores/session.store.ts`'s `SessionState.answers` (architecture.md
 * §10) stores it, keyed by `ExerciseInstance.id` (not `skillId` — the damping/mistake-requeue
 * flow can show the same skill via two different `ExerciseInstance`s in one session, and each
 * needs its own recorded attempt).
 */
export interface AnswerAttempt {
  readonly skillId: SkillId
  readonly answerGiven: string
  readonly correct: boolean
  readonly rating: Rating
  readonly elapsedMs: number
}
