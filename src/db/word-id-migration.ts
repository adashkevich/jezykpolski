/**
 * Task 48 (`spec/tasks/48-progress-migration-word-id-renames.md` §1) — moving stored progress
 * onto the `wordId`s that changed in dictionary v2 (`data/word-id-renames.json`, task 46: 37
 * old → new pairs, e.g. `to|NOUN → to|PRON`, `spocić|VERB → spocić się|VERB`, and the six
 * merged duplicates such as `dziś|NOUN → dziś|ADV`, whose target already existed in v1).
 *
 * Progress is keyed by `wordId` (`skills.skillId`/`skills.wordId`, `reviewLogs.skillId`/
 * `reviewLogs.wordId`, `wordProgress.wordId`). Without this pass every skill of a renamed word
 * is an orphan: the v2 index has no entry for the old id, so `computeWordProgress` /
 * `getParadigm` throw on it and the word itself looks brand new.
 *
 * Same split as `legacy-vocab-migration.ts` (task 37): this module is pure — no Dexie, no
 * content lookups — so its two call sites share one transform and can never drift:
 *  - `repositories/word-id-renames.repository.ts#applyWordIdRenamesToDatabase` — the
 *    one-shot `StartupMigrations.tsx` step (`runOnce('word-id-renames-v2')`), in place;
 *  - `repositories/backup.repository.ts#prepareImport` — a backup exported before the update
 *    still carries the old ids.
 * The one content-dependent input, "does the new word have this dimension at all", comes in as
 * a `hasDimension` callback built by the repository from the loaded index + paradigm
 * (`enumerateSkills`), exactly the slot set every percentage in the app is computed against.
 *
 * Idempotent: no key of the map is a new `wordId` (task 46's acceptance, re-checked by this
 * module's test against the real file), so a second pass finds no old-id skills and leaves
 * the already-rewritten logs alone. Logs of dropped dimensions do keep their old ids on
 * purpose (rule 4 below) — a rerun sees them again and leaves them unchanged again.
 */
import wordIdRenamesFile from '../../data/word-id-renames.json'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import {
  decodeSkillId,
  encodeSkillId,
  type SkillId,
  type WordId,
} from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'

/** Old `wordId` → new `wordId`, as written by `scripts/assemble-words.ts` (task 46). */
export const WORD_ID_RENAMES: Readonly<Record<WordId, WordId>> = wordIdRenamesFile.renames

/** Does `wordId` (a NEW id) have `dimension` among its `enumerateSkills` slots? */
export type HasDimension = (wordId: WordId, dimension: Dimension) => boolean

export interface SkillRenameResult {
  /** Rows to write: moved skills under their new `skillId`, and merge winners (which replace
   *  the row already stored under that `skillId`). */
  readonly put: SkillRecord[]
  /** Old `skillId`s to remove — every old-id skill, moved and dropped alike. Never overlaps
   *  `put` (an old id never equals a new one). */
  readonly delete: SkillId[]
  /** Old-id skills whose dimension the new word doesn't have (spec rule 2) — removed, not moved. */
  readonly dropped: SkillRecord[]
}

/**
 * Spec rule 3's "больший прогресс": a started skill beats a `new` one, then more `reps`, then
 * the later `lastReviewAt`. A full tie keeps `a` — callers pass the row already stored under
 * the target `skillId` as `a`, so a tie never churns the existing row.
 */
function pickMoreProgressed(a: SkillRecord, b: SkillRecord): SkillRecord {
  const aStarted = a.state !== 'new'
  const bStarted = b.state !== 'new'
  if (aStarted !== bStarted) return aStarted ? a : b
  if (a.reps !== b.reps) return a.reps > b.reps ? a : b
  const aLast = a.lastReviewAt ?? -Infinity
  const bLast = b.lastReviewAt ?? -Infinity
  return bLast > aLast ? b : a
}

/**
 * Rule 3: two skills landing on one `skillId` (the merged duplicates). The winner is kept
 * whole — FSRS fields (`stability`, `difficulty`, `due`, `state`, `lapses`), `reps`,
 * `lastReviewAt`, `correctStreak`, `awaitingRecognition` are never mixed between the two —
 * only the plain `correct`/`incorrect` counters are summed (they count answers given, and the
 * user did give all of them).
 */
function mergeSkills(existing: SkillRecord, incoming: SkillRecord): SkillRecord {
  const chosen = pickMoreProgressed(existing, incoming)
  return {
    ...chosen,
    skillId: existing.skillId,
    wordId: existing.wordId,
    correct: existing.correct + incoming.correct,
    incorrect: existing.incorrect + incoming.incorrect,
  }
}

/**
 * Rewrites the skills of renamed words (spec §1 rules 1-3). `skills` must contain every
 * stored skill of the old `wordId`s plus every stored skill of their target `wordId`s (the
 * merge candidates); any other row is ignored and appears in none of the three outputs.
 */
export function migrateSkillsForRenames(
  skills: readonly SkillRecord[],
  renames: Readonly<Record<WordId, WordId>>,
  hasDimension: HasDimension,
): SkillRenameResult {
  const oldSkills = skills.filter((skill) => Object.hasOwn(renames, skill.wordId))
  // Merge candidates: what is already stored under a target `skillId`.
  const bySkillId = new Map<SkillId, SkillRecord>()
  for (const skill of skills) {
    if (!Object.hasOwn(renames, skill.wordId)) bySkillId.set(skill.skillId, skill)
  }

  const put = new Map<SkillId, SkillRecord>()
  const deleteIds: SkillId[] = []
  const dropped: SkillRecord[] = []

  for (const skill of oldSkills) {
    deleteIds.push(skill.skillId)
    const newWordId = renames[skill.wordId]!
    const dimension = skill.dimension as Dimension
    if (!hasDimension(newWordId, dimension)) {
      dropped.push(skill)
      continue
    }
    const moved: SkillRecord = {
      ...skill,
      skillId: encodeSkillId(newWordId, dimension),
      wordId: newWordId,
    }
    const existing = bySkillId.get(moved.skillId)
    const next = existing === undefined ? moved : mergeSkills(existing, moved)
    bySkillId.set(next.skillId, next)
    put.set(next.skillId, next)
  }

  return { put: [...put.values()], delete: deleteIds, dropped }
}

/**
 * Rule 4, the key rewrite itself: a log of a renamed word gets the new `wordId` and the
 * `skillId` re-encoded under it (same dimension). Any other log is returned as-is, by
 * reference. Does NOT know about dropped dimensions — use {@link migrateReviewLogsForRenames},
 * which applies the "logs of dropped dimensions keep their old ids" half of the rule.
 */
export function migrateReviewLog(
  log: ReviewLogRecord,
  renames: Readonly<Record<WordId, WordId>>,
): ReviewLogRecord {
  const newWordId = renames[log.wordId]
  if (newWordId === undefined) return log
  const { dimension } = decodeSkillId(log.skillId)
  return { ...log, wordId: newWordId, skillId: encodeSkillId(newWordId, dimension) }
}

/**
 * Rule 4 in full: logs whose dimension still exists on the new word go through
 * {@link migrateReviewLog}; logs of dropped dimensions are kept unchanged, old `skillId` and
 * old `wordId` — they are history (`/stats` daily counts and accuracy read them), and
 * `confusion.repository.ts` already skips logs whose `wordId` isn't in the index. Same order
 * and length as `logs`; an untouched log is the same object.
 */
export function migrateReviewLogsForRenames(
  logs: readonly ReviewLogRecord[],
  renames: Readonly<Record<WordId, WordId>>,
  hasDimension: HasDimension,
): ReviewLogRecord[] {
  return logs.map((log) => {
    const newWordId = renames[log.wordId]
    if (newWordId === undefined) return log
    const { dimension } = decodeSkillId(log.skillId)
    return hasDimension(newWordId, dimension) ? migrateReviewLog(log, renames) : log
  })
}
