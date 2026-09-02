/**
 * Backup export / import / reset (`spec/tasks/24-settings-backup.md`, `spec/requirements.md`
 * FR-130…FR-132, NFR-16). The insurance policy the task text's own preamble talks about:
 * there is no account and no cloud, so this file — not "polish" — is the only thing standing
 * between a user's progress and a cleared browser profile.
 *
 * `contentVersion` is taken as an explicit parameter everywhere below, never read from
 * `meta.repository.ts#getContentVersion` internally. Decision log: `meta.contentVersion` is
 * only ever written by `meta.repository.ts#syncContentVersion`, and nothing in the app
 * (`ContentProvider.tsx` included) actually calls that function yet — it was built in task
 * 05 for a startup wiring step task 06 evidently never added. Reading it here would silently
 * export `contentVersion: ""` today. The manifest (`ContentContextValue.manifest.
 * contentVersion`, already loaded and guaranteed present by the time any route — including
 * `/settings` — renders, since `AppProviders` gates on `ContentProvider`) is the live source
 * of truth instead; every caller in `features/settings/**` sources it from `useContent()`
 * and passes it in. This also keeps this module free of a dependency on `meta.repository.ts`
 * whose only other job (§4: reset must preserve `meta.contentVersion`) is satisfied simply
 * by `resetAllData` never touching the `meta` table at all.
 *
 * `wordProgress` is never read, written, or cleared directly by the import path (only by
 * `recomputeAll`, called after the transactional replace) or preserved-as-is by
 * `resetAllData` clearing it explicitly — the task text's own rule: it is a denormalized
 * cache of `skills`, never part of the backup contract.
 */
import { db } from '../database.ts'
import { getIndexStore } from '@/content/index-store.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type {
  DailyStatsRecord,
  ReviewLogRecord,
  SessionRecord,
  SkillRecord,
} from '@/types/progress.ts'
import { recomputeAll } from './words-progress.repository.ts'
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  parseBackupJson,
  type BackupExport,
} from '../backup.schema.ts'

// ---------------------------------------------------------------------------
// Export (task text §2)
// ---------------------------------------------------------------------------

/**
 * Reads every backed-up table and shapes them into the export contract. Pure read — never
 * touches the DB. `settings` is flattened from `{key, value}` rows into a plain object (see
 * `backup.schema.ts`'s own header for why).
 */
export async function buildBackupExport(contentVersion: string): Promise<BackupExport> {
  const [skills, reviewLogs, sessions, dailyStats, settingsRows] = await Promise.all([
    db.skills.toArray(),
    db.reviewLogs.toArray(),
    db.sessions.toArray(),
    db.dailyStats.toArray(),
    db.settings.toArray(),
  ])

  const settings: Record<string, unknown> = {}
  for (const row of settingsRows) settings[row.key] = row.value

  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    contentVersion,
    skills,
    reviewLogs,
    sessions,
    dailyStats,
    settings,
  }
}

// ---------------------------------------------------------------------------
// Import (task text §3) — steps 1-2 (read + Zod-validate) live in `backup.schema.ts`'s
// `parseBackupJson` plus the caller that reads the `File` (`features/settings/lib/
// backup-io.ts`). Steps 3-4 (schema-version gate + summary) are `prepareImport` below —
// entirely read-only, the DB is never touched by it. Step 5 (user confirmation) is the UI's
// job. Steps 6-7 (transactional replace + `recomputeAll`) are `applyImport`. Step 8 (report)
// is `applyImport`'s return value.
// ---------------------------------------------------------------------------

export interface ImportSummary {
  readonly skillsCount: number
  readonly reviewLogsCount: number
  readonly sessionsCount: number
  readonly dailyStatsCount: number
  readonly settingsCount: number
  /** Skills whose `wordId` no longer exists in the currently-deployed content index (task
   *  text §3: "Навыки, ссылающиеся на исчезнувшие слова, пропускаются с указанием их числа") —
   *  these will be silently dropped by `applyImport`, counted here up front so the
   *  confirmation summary can mention them before the user commits. */
  readonly missingWordSkillsCount: number
  /** Task text §3: "Расхождение contentVersion — предупреждение, не ошибка". `false` when
   *  the current content version is unknown (nothing to compare against) — never blocks
   *  import either way, purely informational. */
  readonly contentVersionMismatch: boolean
  readonly importedContentVersion: string
  readonly currentContentVersion: string
}

/**
 * Steps 2-4: parses + validates `raw` (throws {@link BackupValidationError} or
 * {@link UnknownBackupSchemaVersionError} from `backup.schema.ts` — the caller is expected to
 * let those propagate to the UI's error message, per NFR-16's "понятная ошибка"), then builds
 * the pre-confirmation summary. Never writes anything — safe to call speculatively the moment
 * a file is picked, before the user has confirmed anything (task text step 5 is strictly
 * after this).
 */
export function prepareImport(
  raw: unknown,
  currentContentVersion: string,
): { data: BackupExport; summary: ImportSummary } {
  const data = parseBackupJson(raw)
  const index = getIndexStore().byId
  const missingWordSkillsCount = data.skills.filter((s) => !index.has(s.wordId as WordId)).length

  return {
    data,
    summary: {
      skillsCount: data.skills.length,
      reviewLogsCount: data.reviewLogs.length,
      sessionsCount: data.sessions.length,
      dailyStatsCount: data.dailyStats.length,
      settingsCount: Object.keys(data.settings).length,
      missingWordSkillsCount,
      contentVersionMismatch: data.contentVersion !== currentContentVersion,
      importedContentVersion: data.contentVersion,
      currentContentVersion,
    },
  }
}

export interface ImportReport {
  readonly importedSkillsCount: number
  /** Task text §3's "их число" — skills dropped because their `wordId` no longer exists in
   *  the current content index. */
  readonly skippedSkillsCount: number
  readonly importedReviewLogsCount: number
  readonly importedSessionsCount: number
  readonly importedDailyStatsCount: number
  readonly importedSettingsCount: number
  readonly contentVersionMismatch: boolean
}

/**
 * Steps 6-7: transactionally replaces `skills`/`reviewLogs`/`sessions`/`dailyStats`/
 * `settings` with `data`'s contents (a skill whose `wordId` doesn't exist in the current
 * content index is silently dropped — same filter `prepareImport` already previewed, applied
 * for real here), then calls `recomputeAll()` to rebuild `wordProgress` from the freshly
 * imported `skills` (task text §3 step 7; NOT part of the transaction — `recomputeAll`'s own
 * header explains why holding an IndexedDB `readwrite` transaction open across the `fetch()`
 * calls its content lookups need is unsafe).
 *
 * Atomicity (NFR-16's "до записи в БД", this task's acceptance point 2 "битый JSON... не
 * трогает БД"): every write below is inside one `db.transaction('rw', ...)` call. If any
 * `bulkAdd` throws — e.g. a `skillId`/`sessions` `id` collision from two rows sharing a
 * primary key, the one shape `parseBackupJson`'s per-field Zod schema cannot catch on its
 * own — Dexie/IndexedDB aborts the whole transaction and every table already `clear()`-ed
 * inside it rolls back automatically; nothing partially-imported is ever left visible. A
 * caller only needs to let this rejection propagate (never swallow it) for that guarantee to
 * hold at the UI layer too.
 *
 * Explicit `.clear()` + `.bulkAdd()` (not `.bulkPut()`) so a colliding primary key inside
 * `data` itself — not just a collision against pre-existing rows, which `.clear()` already
 * ruled out — surfaces as a hard failure instead of a silent last-write-wins overwrite,
 * consistent with NFR-16's "never trust the input's structure": two rows sharing a `skillId`
 * is exactly the kind of malformed-but-schema-shaped input Zod's per-field checks cannot see.
 */
export async function applyImport(
  data: BackupExport,
  currentContentVersion: string,
): Promise<ImportReport> {
  const index = getIndexStore().byId
  const validSkills = data.skills.filter((s) => index.has(s.wordId as WordId)) as SkillRecord[]
  const skippedSkillsCount = data.skills.length - validSkills.length

  await db.transaction(
    'rw',
    db.skills,
    db.reviewLogs,
    db.sessions,
    db.dailyStats,
    db.settings,
    async () => {
      await db.skills.clear()
      await db.reviewLogs.clear()
      await db.sessions.clear()
      await db.dailyStats.clear()
      await db.settings.clear()

      if (validSkills.length > 0) await db.skills.bulkAdd(validSkills)
      if (data.reviewLogs.length > 0) {
        await db.reviewLogs.bulkAdd(data.reviewLogs as ReviewLogRecord[])
      }
      if (data.sessions.length > 0) await db.sessions.bulkAdd(data.sessions as SessionRecord[])
      if (data.dailyStats.length > 0) {
        await db.dailyStats.bulkAdd(data.dailyStats as DailyStatsRecord[])
      }
      const settingsRows = Object.entries(data.settings).map(([key, value]) => ({ key, value }))
      if (settingsRows.length > 0) await db.settings.bulkAdd(settingsRows)
    },
  )

  // Outside the transaction on purpose — see this function's own doc comment.
  await recomputeAll()

  return {
    importedSkillsCount: validSkills.length,
    skippedSkillsCount,
    importedReviewLogsCount: data.reviewLogs.length,
    importedSessionsCount: data.sessions.length,
    importedDailyStatsCount: data.dailyStats.length,
    importedSettingsCount: Object.keys(data.settings).length,
    contentVersionMismatch: data.contentVersion !== currentContentVersion,
  }
}

// ---------------------------------------------------------------------------
// Reset (task text §4, FR-132)
// ---------------------------------------------------------------------------

/**
 * Full learning-data reset. Clears `skills`/`wordProgress`/`reviewLogs`/`sessions`/
 * `dailyStats`/`settings` in one transaction — `meta` (i.e. `contentVersion`) is never
 * touched, satisfying the task text's own "кроме `meta.contentVersion`" carve-out simply by
 * omission (no `db.meta` table appears anywhere in this function or its transaction scope).
 */
export async function resetAllData(): Promise<void> {
  // Six tables — past Dexie's typed 5-table `transaction()` overload, so this uses the
  // `tables: readonly (string | Table)[]` overload instead (same method, just the array
  // form `dexie.d.ts` declares for exactly this case).
  await db.transaction(
    'rw',
    [db.skills, db.wordProgress, db.reviewLogs, db.sessions, db.dailyStats, db.settings],
    async () => {
      await db.skills.clear()
      await db.wordProgress.clear()
      await db.reviewLogs.clear()
      await db.sessions.clear()
      await db.dailyStats.clear()
      await db.settings.clear()
    },
  )
}
