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
import type { ExerciseCategory } from '@/learning/exercises/picker.ts'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import type { HintMode } from '@/learning/exercises/hint-mode.ts'
import type { LearnQueueItem, PracticeQueueItem } from '@/learning/session/session.types.ts'
import { shouldUnlockCuedRecall, shouldUnlockProduction } from '@/learning/progress/stage.ts'
import { encodeSkillId } from '@/learning/skills/skill-id.ts'
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
 * one vocab skill via `ensureSkill` — `newWordDimension` (default `'vocab:pl-ru'`, every
 * ordinary Learn caller's implicit choice, task rule 4 / FR-81's "progression isn't
 * front-loaded in one sitting"): the later stages are normally opened later, by
 * `answer-pipeline.ts#unlockNextVocabStage`, once each stage clears its stability bar.
 *
 * Task 31 (`spec/tasks/31-practice-vocabulary-drills.md` §3) widens this to
 * `'vocab:ru-pl-input'` too: `useSessionBootstrap.ts`'s `{ kind: 'practice-extra', variant:
 * 'vocab-spelling' }` branch needs a brand-new word's *production* skill materialized
 * on demand, the same `ensureSkill` path task 28 already made routine for Learn — no new
 * materialization logic, just a caller-chosen dimension instead of the hard-coded one.
 *
 * Task 28's backfill, widened to a two-step chain by task 37: a `'due'` item that already
 * cleared a stability bar gets the next stage's skill ensured here too —
 * `vocab:pl-ru` -> `vocab:ru-pl-choice`, `vocab:ru-pl-choice` -> `vocab:ru-pl-input`. Words
 * learned before a given threshold existed never went through the answer-time promotion —
 * without this they would stay stuck on their current stage forever, and fixing that here
 * (idempotent `ensureSkill`, same predicates as the answer path) is cheaper and safer than a
 * one-shot database migration over every skill row.
 */
export async function materializeQueueItem(
  item: LearnQueueItem,
  cache: SessionContentCache,
  newWordDimension: 'vocab:pl-ru' | 'vocab:ru-pl-choice' | 'vocab:ru-pl-input' = 'vocab:pl-ru',
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
    if (descriptor.dimension === 'vocab:pl-ru' && shouldUnlockCuedRecall(item.skill)) {
      await ensureSkill(
        encodeSkillId(wordId, 'vocab:ru-pl-choice'),
        wordId,
        'vocab',
        'vocab:ru-pl-choice',
      )
    } else if (descriptor.dimension === 'vocab:ru-pl-choice' && shouldUnlockProduction(item.skill)) {
      await ensureSkill(
        encodeSkillId(wordId, 'vocab:ru-pl-input'),
        wordId,
        'vocab',
        'vocab:ru-pl-input',
      )
    }
    return { descriptor, skill: item.skill }
  }

  const descriptor = descriptors.find((d) => d.dimension === newWordDimension)
  if (!descriptor) {
    throw new Error(`materializeQueueItem: "${wordId}" has no ${newWordDimension} descriptor at all`)
  }
  const skill = await ensureSkill(descriptor.skillId, wordId, 'vocab', newWordDimension)
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
 * Task 31 (`spec/tasks/31-practice-vocabulary-drills.md` §3) — the
 * `{ kind: 'practice-extra' }` counterpart of `generateForSkill` above. Task 27's version of
 * this function called 2 dedicated Practice-only builders directly, bypassing
 * `generateExercise` entirely; those 2 exercise types are gone (FR-56/FR-57 cancelled), and
 * this version calls the ordinary `generateExercise` instead — the same call Learn makes for
 * any vocab skill. `descriptor` is already the exact `vocab:pl-ru` (variant `'vocab-choice'`)
 * or `vocab:ru-pl-input` (`'vocab-spelling'`) `SkillDescriptor` `useSessionBootstrap.ts`'s
 * practice-extra branch materialized via `materializeQueueItem`'s `newWordDimension`
 * parameter — `picker.ts#vocabExerciseType` reads a vocab skill's type off its *dimension*
 * alone (never `srs`/`state`), so passing that descriptor through `generateExercise`
 * deterministically yields `choice` for `vocab:pl-ru` and `input` for `vocab:ru-pl-input`,
 * without this function ever needing to force a type of its own.
 */
export function generateExtraForWord(
  variant: PracticeExtraVariant,
  descriptor: SkillDescriptor,
  srsRecord: SkillRecord,
  cache: SessionContentCache,
  attempt: number,
): ExerciseInstance {
  // Defensive wiring check, not a real runtime case: `useSessionBootstrap.ts` materializes
  // `descriptor` via `materializeQueueItem`'s `newWordDimension` argument, which it derives
  // from this exact `variant` (session-scope.ts's own table) — the two can only disagree if
  // that call site itself has a bug.
  const expectedDimension = variant === 'vocab-choice' ? 'vocab:pl-ru' : 'vocab:ru-pl-input'
  if (descriptor.dimension !== expectedDimension) {
    throw new Error(
      `generateExtraForWord: variant "${variant}" expects a "${expectedDimension}" ` +
        `descriptor, got "${descriptor.dimension}"`,
    )
  }
  return generateForSkill(descriptor, srsRecord, cache, attempt)
}
