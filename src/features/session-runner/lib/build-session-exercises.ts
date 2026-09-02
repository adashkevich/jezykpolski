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
import { generateExercise } from '@/learning/exercises/generate.ts'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { HintMode } from '@/learning/exercises/hint-mode.ts'
import type { LearnQueueItem } from '@/learning/session/session.types.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'
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
): ExerciseInstance {
  const ctx = cache.toContentContext()
  const seed = seedFor(descriptor.skillId, attempt)
  return generateExercise(descriptor, srsRecord, ctx, seed, { hintMode })
}
