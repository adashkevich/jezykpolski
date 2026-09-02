/**
 * `LearnQueueItem` (pure plan, `@/learning/session/session.types.ts`) -> a concrete
 * `ExerciseInstance` (`@/learning/exercises/generate.ts`, task 09) — the glue task 13 itself
 * owns (`spec/tasks/13-session-runner.md` §1's "lazy" half: a `'new'` item only gets its
 * `vocab:pl-ru` skill materialized — task rule 4 — right here, when it's actually about to
 * be shown, not any earlier).
 *
 * `SkillDescriptor` (needed by `generateExercise` for `acceptedAnswers` on morphological
 * skills) isn't stored anywhere — it's re-derived from `enumerateSkills(word, paradigm)`
 * every time, same as `words-progress.repository.ts#computeWordProgress` already does. That
 * duplication is deliberate, not an oversight: `enumerateSkills` is a cheap, pure, synchronous
 * function over already-cached content, and re-deriving it here means this module never has
 * to invent its own cache-invalidation story for a `SkillDescriptor` cache.
 */
import { enumerateSkills, type SkillDescriptor } from '@/learning/skills/enumerate.ts'
import {
  generateExercise,
  generateOddOneOutExercise,
  generatePosClassifyExercise,
} from '@/learning/exercises/generate.ts'
import type { ExerciseCategory } from '@/learning/exercises/picker.ts'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { HintMode } from '@/learning/exercises/hint-mode.ts'
import type { LearnQueueItem, PracticeQueueItem } from '@/learning/session/session.types.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'
import type { PracticeExtraVariant } from './session-scope.ts'
import { seedFor } from './seed.ts'
import type { SessionContentCache } from './session-content-context.ts'

export interface MaterializedQueueEntry {
  readonly descriptor: SkillDescriptor
  readonly skill: SkillRecord
}

/**
 * Resolves the `SkillDescriptor` for `item` and, for a `'new'` word, materializes exactly
 * its `vocab:pl-ru` skill via `ensureSkill` — never `vocab:ru-pl` (task rule 4, FR-81's
 * "progression isn't front-loaded in one sitting": `ru-pl` gets its own `SkillRecord`, and
 * therefore its own `due`, only once the SRS scheduler decides to hand it out on some later
 * pass through `getDueSkills`).
 */
export async function materializeQueueItem(
  item: LearnQueueItem,
  cache: SessionContentCache,
): Promise<MaterializedQueueEntry> {
  const wordId = item.source === 'due' ? item.skill.wordId : item.wordId
  await cache.preload(wordId)
  const ctx = cache.toContentContext()
  const wordEntry = ctx.getWordEntry(wordId)
  const paradigm = ctx.getParadigm(wordId)
  const descriptors = enumerateSkills(wordEntry, paradigm ?? undefined)

  if (item.source === 'due') {
    const descriptor = descriptors.find((d) => d.skillId === item.skill.skillId)
    if (!descriptor) {
      throw new Error(
        `materializeQueueItem: no SkillDescriptor for "${item.skill.skillId}" — the word's ` +
          `content no longer enumerates this dimension (stale SkillRecord?).`,
      )
    }
    return { descriptor, skill: item.skill }
  }

  const descriptor = descriptors.find((d) => d.dimension === 'vocab:pl-ru')
  if (!descriptor) {
    throw new Error(`materializeQueueItem: "${wordId}" has no vocab:pl-ru descriptor at all`)
  }
  const skill = await ensureSkill(descriptor.skillId, wordId, 'vocab', 'vocab:pl-ru')
  return { descriptor, skill }
}

/**
 * The Practice counterpart of `materializeQueueItem` above (task 19,
 * `spec/tasks/19-practice-mode.md` §2's "новые навыки материализуются по мере показа, та же
 * ensureSkill"). Unlike a `LearnQueueItem`, a `PracticeQueueItem` has no `'due'`/`'new'`
 * split to preserve — `build-practice-queue.ts` already resolved *which* skill this is by
 * matching the user's explicit dimension selection, so this always calls `ensureSkill`
 * unconditionally, exactly like `session-scope.ts#resolveSkillScope` does for task 17's
 * single-cell scope.
 */
export async function materializePracticeItem(
  item: PracticeQueueItem,
  cache: SessionContentCache,
): Promise<MaterializedQueueEntry> {
  await cache.preload(item.wordId)
  const ctx = cache.toContentContext()
  const wordEntry = ctx.getWordEntry(item.wordId)
  const paradigm = ctx.getParadigm(item.wordId)
  const descriptors = enumerateSkills(wordEntry, paradigm ?? undefined)

  const descriptor = descriptors.find((d) => d.skillId === item.skillId)
  if (!descriptor) {
    throw new Error(
      `materializePracticeItem: no SkillDescriptor for "${item.skillId}" — the word's ` +
        `content no longer enumerates this dimension.`,
    )
  }
  const skill = await ensureSkill(descriptor.skillId, item.wordId, descriptor.kind, descriptor.dimension)
  return { descriptor, skill }
}

/**
 * Builds the actual `ExerciseInstance` for an already-materialized skill. Split out from
 * `materializeQueueItem` so a mistake-requeue (task text §4's damping scenario: the same
 * skill shown a second time in one session, with a bumped `attempt` so the seed — and
 * therefore e.g. the distractor set — differs) can call this directly with the skill's
 * *current* `SkillRecord` (re-fetched from Dexie right before regenerating) without
 * re-deriving `SkillDescriptor` or re-touching `ensureSkill`.
 */
export function generateForSkill(
  descriptor: SkillDescriptor,
  srsRecord: SkillRecord,
  cache: SessionContentCache,
  attempt: number,
  hintMode?: HintMode,
  /** Task 19's Practice "Тип задания" restriction (`learning/exercises/picker.ts`'s
   *  `PickerOptions.forceCategory`) — `undefined` for every Learn/mistake/skill-scope caller,
   *  unchanged behavior. */
  forceCategory?: ExerciseCategory,
): ExerciseInstance {
  const ctx = cache.toContentContext()
  const seed = seedFor(descriptor.skillId, attempt)
  return generateExercise(descriptor, srsRecord, ctx, seed, { hintMode, forceCategory })
}

/**
 * Task 27 (`spec/tasks/27-context-and-error-analysis.md` §4, FR-56/FR-57) — the
 * `{ kind: 'practice-extra' }` counterpart of `generateForSkill` above: instead of
 * `generateExercise`/`pickExerciseType` (which would only ever pick a plain vocab
 * `choice`/`input` for a `vocab:pl-ru` skill), this calls `generate.ts`'s dedicated
 * `generateOddOneOutExercise`/`generatePosClassifyExercise` builders directly — the "явный
 * forced-type, в обход pickExerciseType" the task text asks for. `descriptor` is still the
 * word's `vocab:pl-ru` `SkillDescriptor` (see `useSessionBootstrap.ts`'s practice-extra
 * branch: it materializes exactly that skill, via `materializeQueueItem`'s existing
 * 'new'-word path, purely so `reviewLogs`/FSRS bookkeeping has a real skill to attach to —
 * these 2 exercise types have no dimension of their own to test, "лишний перевод"/"часть
 * речи" are both vocabulary-adjacent facts about the whole word).
 */
export function generateExtraForWord(
  variant: PracticeExtraVariant,
  descriptor: SkillDescriptor,
  cache: SessionContentCache,
  attempt: number,
): ExerciseInstance {
  const ctx = cache.toContentContext()
  const seed = seedFor(descriptor.skillId, attempt)
  const exercise =
    variant === 'odd-one-out'
      ? generateOddOneOutExercise(descriptor.wordId, ctx, seed)
      : generatePosClassifyExercise(descriptor.wordId, ctx)
  return { id: `${descriptor.skillId}::${variant}::${seed}`, skillId: descriptor.skillId, exercise }
}
