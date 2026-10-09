/**
 * Task 48 (`spec/tasks/48-progress-migration-word-id-renames.md` §2-3) — the content- and
 * Dexie-aware half of the `wordId` rename migration; the transform itself is the pure
 * `db/word-id-migration.ts`.
 *
 * Why not a Dexie `version(3).upgrade()`: dropping a dimension the new word doesn't have
 * needs that word's paradigm (`hasDimension` → `enumerateSkills`), i.e. the loaded content
 * index, and `db.open()` runs before `ContentProvider` mounts. Same split as task 37: the
 * step runs from `StartupMigrations.tsx` under `runOnce('word-id-renames-v2')`, schema
 * unchanged (no index changes).
 *
 * Content not available (index not initialized, a paradigm shard fetch failing offline, a
 * target `wordId` missing from the index) always THROWS — never "no paradigm, drop the
 * grammar skills". `runOnce` records its key only after the task resolves, so a failure leaves
 * the DB untouched (nothing is written before the dimensions are known) and the step is
 * retried on the next start.
 */
import { getIndexStore } from '@/content/index-store.ts'
import { getParadigm } from '@/content/paradigms.ts'
import { enumerateSkills } from '@/learning/skills/enumerate.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'
import { db } from '../database.ts'
import {
  WORD_ID_RENAMES,
  migrateReviewLogsForRenames,
  migrateSkillsForRenames,
  type HasDimension,
} from '../word-id-migration.ts'
import { recomputeAll } from './words-progress.repository.ts'

const OLD_WORD_IDS: readonly WordId[] = Object.keys(WORD_ID_RENAMES)

/** New `wordId`s that `records` (skills or logs) would be moved onto. */
function renameTargetsOf(records: Iterable<{ readonly wordId: WordId }>): Set<WordId> {
  const targets = new Set<WordId>()
  for (const { wordId } of records) {
    const target = WORD_ID_RENAMES[wordId]
    if (target !== undefined) targets.add(target)
  }
  return targets
}

/**
 * Builds `hasDimension` for `targetWordIds` from the loaded index + paradigm — the same
 * `enumerateSkills` slot set `computeWordProgress` measures a word against. Fetches the
 * paradigm shards it needs, so call it OUTSIDE any IndexedDB transaction. The returned
 * callback throws for a word it wasn't built for: the caller asked about a word it never
 * read, and guessing "no such dimension" would silently delete progress.
 */
export async function loadRenameTargetDimensions(
  targetWordIds: Iterable<WordId>,
): Promise<HasDimension> {
  const index = getIndexStore().byId
  const dimensionsByWord = new Map<WordId, ReadonlySet<string>>()
  await Promise.all(
    [...new Set(targetWordIds)].map(async (wordId) => {
      const entry = index.get(wordId)
      if (!entry) {
        throw new Error(`word-id renames: target wordId "${wordId}" is not in the content index`)
      }
      const paradigm = await getParadigm(wordId)
      const descriptors = enumerateSkills(entry, paradigm ?? undefined)
      dimensionsByWord.set(wordId, new Set(descriptors.map((d) => d.dimension)))
    }),
  )
  return (wordId, dimension) => {
    const dimensions = dimensionsByWord.get(wordId)
    if (dimensions === undefined) {
      throw new Error(`word-id renames: dimensions of "${wordId}" were not loaded`)
    }
    return dimensions.has(dimension)
  }
}

// `where('wordId').equals(id).toArray()` per id rather than one `anyOf(...)`: a plain key
// range goes through `IDBIndex.getAll()`, while `anyOf` walks an index cursor — and cursors
// are what bricked startup on some WebKit builds (`words-progress.repository.ts#recomputeAll`'s
// header). 37 tiny indexed reads cost nothing.
async function readSkillsOf(wordIds: Iterable<WordId>): Promise<SkillRecord[]> {
  const rows = await Promise.all(
    [...wordIds].map((wordId) => db.skills.where('wordId').equals(wordId).toArray()),
  )
  return rows.flat()
}

async function readLogsOf(wordIds: Iterable<WordId>): Promise<ReviewLogRecord[]> {
  const rows = await Promise.all(
    [...wordIds].map((wordId) => db.reviewLogs.where('wordId').equals(wordId).toArray()),
  )
  return rows.flat()
}

export interface WordIdRenameReport {
  /** Old-id skills now stored under a new `skillId` (merged ones included). */
  readonly movedSkills: number
  /** Old-id skills removed because the new word has no such dimension. */
  readonly droppedSkills: number
  /** Logs rewritten onto the new ids (logs of dropped dimensions are kept as they were). */
  readonly rewrittenLogs: number
}

const NOTHING_TO_DO: WordIdRenameReport = { movedSkills: 0, droppedSkills: 0, rewrittenLogs: 0 }

/**
 * The in-place step (spec §2): moves `skills` and `reviewLogs` of renamed words in ONE `rw`
 * transaction over both tables. Does not touch `wordProgress` — that cache is rebuilt by the
 * caller's `recomputeAll()` ({@link runWordIdRenamesMigration}).
 *
 * Two phases, because the dimension lookup may fetch paradigm shards and an IndexedDB
 * transaction must never stay open across a `fetch()` (`recomputeAll`'s header): first read
 * which renamed words this profile has anything for and load just their targets' dimensions —
 * a profile with none (fresh install, or no renamed word ever touched) stops here, writing and
 * fetching nothing — then re-read inside the transaction and write. Old-id rows can't appear
 * in between (no screen can reach a word that isn't in the index); if one somehow did, its
 * target's dimensions weren't loaded, `hasDimension` throws and the transaction aborts.
 */
export async function applyWordIdRenamesToDatabase(): Promise<WordIdRenameReport> {
  const [oldSkills, oldLogs] = await Promise.all([
    readSkillsOf(OLD_WORD_IDS),
    readLogsOf(OLD_WORD_IDS),
  ])
  if (oldSkills.length === 0 && oldLogs.length === 0) return NOTHING_TO_DO

  const hasDimension = await loadRenameTargetDimensions(renameTargetsOf([...oldSkills, ...oldLogs]))

  return db.transaction('rw', db.skills, db.reviewLogs, async () => {
    const [skillsOfOldIds, logsOfOldIds] = await Promise.all([
      readSkillsOf(OLD_WORD_IDS),
      readLogsOf(OLD_WORD_IDS),
    ])
    const skillsOfTargets = await readSkillsOf(renameTargetsOf(skillsOfOldIds))

    const skills = migrateSkillsForRenames(
      [...skillsOfOldIds, ...skillsOfTargets],
      WORD_ID_RENAMES,
      hasDimension,
    )
    const migratedLogs = migrateReviewLogsForRenames(logsOfOldIds, WORD_ID_RENAMES, hasDimension)
    const rewrittenLogs = migratedLogs.filter((log, i) => log !== logsOfOldIds[i])

    if (skills.delete.length > 0) await db.skills.bulkDelete(skills.delete)
    if (skills.put.length > 0) await db.skills.bulkPut(skills.put)
    // Each log keeps its `id`, so `bulkPut` replaces it in place.
    if (rewrittenLogs.length > 0) await db.reviewLogs.bulkPut(rewrittenLogs)

    return {
      movedSkills: skillsOfOldIds.length - skills.dropped.length,
      droppedSkills: skills.dropped.length,
      rewrittenLogs: rewrittenLogs.length,
    }
  })
}

/**
 * `StartupMigrations.tsx`'s `word-id-renames-v2` task: the in-place step, a console line
 * with the counts, then `recomputeAll()` — the `wordProgress` cache is rebuilt for the new
 * ids, and its `clear()` removes the rows of the vanished old ids in the same pass. Both are
 * inside the one `runOnce` task, so if the recompute fails the key stays unwritten and the
 * next start reruns both (the step itself is then a no-op).
 */
export async function runWordIdRenamesMigration(): Promise<void> {
  const report = await applyWordIdRenamesToDatabase()
  if (report.movedSkills + report.droppedSkills + report.rewrittenLogs > 0) {
    console.info(
      `word-id-renames-v2: перенесено навыков — ${report.movedSkills}, ` +
        `отброшено (у нового слова нет такого измерения) — ${report.droppedSkills}, ` +
        `переписано логов — ${report.rewrittenLogs}`,
    )
  }
  await recomputeAll()
}

export interface RenamedBackupLists {
  readonly skills: SkillRecord[]
  readonly reviewLogs: ReviewLogRecord[]
  readonly movedSkills: number
  readonly droppedSkills: number
}

/**
 * Spec §3: the same transform over a backup file's arrays (`backup.repository.ts#
 * prepareImport`), so a backup exported before the update imports into the state the in-place
 * step would have produced. A backup with no renamed `wordId` (any backup exported after the
 * update) passes through without touching content at all.
 */
export async function applyWordIdRenamesToLists(
  skills: readonly SkillRecord[],
  reviewLogs: readonly ReviewLogRecord[],
): Promise<RenamedBackupLists> {
  const targets = renameTargetsOf([...skills, ...reviewLogs])
  if (targets.size === 0) {
    return { skills: [...skills], reviewLogs: [...reviewLogs], movedSkills: 0, droppedSkills: 0 }
  }

  const hasDimension = await loadRenameTargetDimensions(targets)
  const result = migrateSkillsForRenames(skills, WORD_ID_RENAMES, hasDimension)
  const replaced = new Set([...result.delete, ...result.put.map((s) => s.skillId)])
  return {
    skills: [...skills.filter((s) => !replaced.has(s.skillId)), ...result.put],
    reviewLogs: migrateReviewLogsForRenames(reviewLogs, WORD_ID_RENAMES, hasDimension),
    movedSkills: result.delete.length - result.dropped.length,
    droppedSkills: result.dropped.length,
  }
}
