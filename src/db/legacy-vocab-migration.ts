/**
 * Task 37 (`spec/tasks/37-three-stage-vocabulary.md` §3) split the old single `vocab:ru-pl`
 * skill (задача 28's этап 2 — "написать слово по-польски") into two: the renamed
 * `vocab:ru-pl-input` (same meaning, same FSRS history) plus a brand-new
 * `vocab:ru-pl-choice` backfilled as a COPY of that same history. The backfill is not
 * optional: `enumerateSkills`' vocab denominator grows from 2 to 3 for every affected word,
 * so without it `vocabMaturity` — and therefore `deriveStatus` — would regress for every
 * word that already had real `vocab:ru-pl` progress (a user who already types a word
 * correctly would see it fall out of `known`/`mastered`). Copying the existing state is the
 * least surprising choice: whoever already reached этап 2 (typing) obviously cleared the
 * easier middle stage (choosing among Polish distractors) too, even though no `SkillRecord`
 * for it ever existed under the old two-stage model.
 *
 * Two independent call sites share this one transform so they can never drift:
 *  - `db/database.ts`'s `version(2)` Dexie migration — runs once per browser profile,
 *    rewrites `skills`/`reviewLogs` in place;
 *  - `db/repositories/backup.repository.ts`'s import path — a backup file exported before
 *    task 37 still carries the old dimension string, and importing it into an
 *    already-migrated database must not reintroduce `vocab:ru-pl`.
 *
 * Pure string/array transforms only — no Dexie, no content lookups — so both call sites can
 * run it before, or entirely without, a live transaction or `ContentProvider` (the Dexie
 * `version().upgrade()` callback in particular has neither available — see
 * `database.ts`'s own header for why the `wordProgress` cache rebuild this migration also
 * implies has to happen separately, in `StartupMigrations.tsx`, once content *is* loaded).
 */
import { decodeSkillId, encodeSkillId, type SkillId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'

/** The dimension string every `vocab:ru-pl` skill/log carried before task 37. No longer a
 *  valid `Dimension` — kept here as a bare string so this module can recognize and rewrite
 *  it without the `Dimension` type itself ever naming it again. */
export const LEGACY_VOCAB_RU_PL_DIMENSION = 'vocab:ru-pl'

function isLegacyRuPlSkillId(skillId: string): boolean {
  return skillId.endsWith(`::${LEGACY_VOCAB_RU_PL_DIMENSION}`)
}

/** `"<wordId>::vocab:ru-pl"` -> `"<wordId>::vocab:ru-pl-input"`. Any other `skillId`
 *  (already-current vocab dimensions, every morphological dimension) passes through
 *  unchanged, by reference — cheap to call on every row without a branch at the call site. */
export function renameLegacyRuPlSkillId(skillId: SkillId): SkillId {
  if (!isLegacyRuPlSkillId(skillId)) return skillId
  const { wordId } = decodeSkillId(skillId)
  return encodeSkillId(wordId, 'vocab:ru-pl-input')
}

/**
 * Rewrites a `skills` array: every row whose `dimension === 'vocab:ru-pl'` is renamed to
 * `vocab:ru-pl-input` and gets a `vocab:ru-pl-choice` sibling backfilled as a copy of its
 * SRS state (see this module's header for why a copy, not a fresh `new`-state row). Every
 * other row — already-current vocab dimensions, all morphology — passes through unchanged.
 * Row order is not preserved for migrated words (the backfilled sibling is appended right
 * after its source row); no caller here relies on `skills` order.
 */
export function migrateLegacySkills(skills: readonly SkillRecord[]): SkillRecord[] {
  const result: SkillRecord[] = []
  for (const skill of skills) {
    if (skill.dimension !== LEGACY_VOCAB_RU_PL_DIMENSION) {
      result.push(skill)
      continue
    }
    result.push(
      { ...skill, skillId: renameLegacyRuPlSkillId(skill.skillId), dimension: 'vocab:ru-pl-input' },
      {
        ...skill,
        skillId: encodeSkillId(skill.wordId, 'vocab:ru-pl-choice'),
        dimension: 'vocab:ru-pl-choice',
      },
    )
  }
  return result
}

/**
 * Rewrites one `reviewLogs.skillId` value the same way a migrated `skills` row's own
 * `skillId` was rewritten — no backfilled sibling log: `reviewLogs` records answers actually
 * given, and no answer was ever given to the newly-materialized `vocab:ru-pl-choice` skill
 * (the pre-task-37 `vocab:ru-pl` skill was always an `input` exercise — `picker.ts`'s
 * pre-task-37 `vocabExerciseType`, task 28 — so every log referencing it genuinely was a
 * typed answer, correctly attributed to `vocab:ru-pl-input` after the rename).
 */
export function migrateLegacyReviewLogSkillId(skillId: SkillId): SkillId {
  return renameLegacyRuPlSkillId(skillId)
}
