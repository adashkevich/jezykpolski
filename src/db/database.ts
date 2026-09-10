/**
 * `PolishLearningDatabase` — the Dexie schema (`spec/tasks/05-persistence.md` §1,
 * `spec/architecture.md` §8, mirrored field-for-field).
 *
 * This is the ONLY module in the app allowed to hold the live `Dexie` instance. Everything
 * outside `src/db/**` — components, hooks in `src/hooks/**` (which call into
 * `src/db/repositories/**`, not this file), `learning/**` — must go through the repositories
 * in `src/db/repositories/**`, never `db.table(...)` directly (architecture.md §3, NFR-12,
 * this task's acceptance point 7). `eslint.config.js` enforces this with a
 * `no-restricted-imports` rule scoped to everything outside `src/db/**`.
 *
 * Migrations: every schema change is a new `this.version(n).stores({...})` (with an
 * `.upgrade(tx => ...)` callback only where data actually needs transforming) — never a
 * destructive edit of an existing `version(n).stores()` call. `wordProgress` is the one
 * exception allowed to be rebuilt wholesale in a migration (it's a full cache of `skills`,
 * never a second source of truth — architecture.md §8 "Миграции").
 *
 * `version(2)` (task 37, `spec/tasks/37-three-stage-vocabulary.md` §3) is this app's first
 * real migration: it renames every `skills`/`reviewLogs` row's old `vocab:ru-pl` dimension to
 * `vocab:ru-pl-input` and backfills a `vocab:ru-pl-choice` sibling for each renamed skill —
 * see `legacy-vocab-migration.ts`'s header for why the backfill, not just a rename, and why
 * that logic lives in its own module (the backup-import path needs the exact same transform,
 * `backup.repository.ts`). This migration does NOT touch `wordProgress` — that cache still
 * needs rebuilding under the new three-skill model, but `computeWordProgress` needs the
 * content index loaded (`getIndexStore()`/`getParadigm()`), which is never true this early —
 * `db.open()` runs before `ContentProvider` even mounts. That part runs separately, as a
 * `meta.repository.ts#runOnce` pass in `StartupMigrations.tsx`, exactly the same split task
 * 28's own `deriveStatus` migration already established (see that component's header).
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  DailyStatsRecord,
  ReviewLogRecord,
  SessionRecord,
  SkillRecord,
  WordProgressRecord,
} from '@/types/progress.ts'
import {
  LEGACY_VOCAB_RU_PL_DIMENSION,
  migrateLegacyReviewLogSkillId,
  migrateLegacySkills,
} from './legacy-vocab-migration.ts'

/**
 * `settings` — small set of user-facing preferences (theme, daily goal, ...). Declared here
 * rather than in `types/progress.ts` (task 03's file, scoped to *progress* domain records)
 * because a setting isn't a progress fact — it's storage-layer key/value config, this task's
 * own concern. Generic over `T` so `settings.repository.ts#get<T>` can hand back a typed
 * value without a cast at the call site.
 */
export interface SettingRecord<T = unknown> {
  /** Primary key. */
  key: string
  value: T
}

/**
 * `meta` — internal bookkeeping the app itself owns (currently just `contentVersion`, task
 * text §6). Kept as a separate table/type from `settings` even though the shape is
 * identical: `settings` is user-editable app-level preferences, `meta` is not something a
 * settings screen ever lists or lets the user change directly.
 */
export interface MetaRecord<T = unknown> {
  /** Primary key. */
  key: string
  value: T
}

export class PolishLearningDatabase extends Dexie {
  skills!: EntityTable<SkillRecord, 'skillId'>
  wordProgress!: EntityTable<WordProgressRecord, 'wordId'>
  reviewLogs!: EntityTable<ReviewLogRecord, 'id'>
  sessions!: EntityTable<SessionRecord, 'id'>
  dailyStats!: EntityTable<DailyStatsRecord, 'date'>
  settings!: EntityTable<SettingRecord, 'key'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(name = 'PolishLearningDB') {
    super(name)
    // Exact index string from architecture.md §8 — do not "improve" it without a matching
    // `version(2)` migration; see this file's header.
    this.version(1).stores({
      skills: 'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
      wordProgress: 'wordId, status, nextDue, updatedAt',
      reviewLogs: '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
      sessions: '++id, mode, startedAt, endedAt',
      dailyStats: 'date',
      settings: 'key',
      meta: 'key',
    })

    // No index string changes — `dimension` was never indexed, and `skillId` stays the
    // primary key — so `version(2)` re-declares the identical schema and does its work
    // entirely in `.upgrade()`. `skillId` IS the primary key of `skills`, so a renamed row
    // can't go through `Collection#modify()` (Dexie forbids mutating the primary key that
    // way) — delete-then-bulkAdd instead, scoped to only the legacy rows (`.filter()`, not
    // `.toArray()` + JS filter, so this never even deserializes the far larger set of
    // already-current rows). `reviewLogs.skillId` is a plain indexed field, not the primary
    // key (`++id` is) — `.modify()` works fine there.
    this.version(2)
      .stores({
        skills: 'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
        wordProgress: 'wordId, status, nextDue, updatedAt',
        reviewLogs: '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
        sessions: '++id, mode, startedAt, endedAt',
        dailyStats: 'date',
        settings: 'key',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const skillsTable = tx.table<SkillRecord, string>('skills')
        const legacySkills = await skillsTable
          .filter((skill) => skill.dimension === LEGACY_VOCAB_RU_PL_DIMENSION)
          .toArray()
        if (legacySkills.length > 0) {
          await skillsTable.bulkDelete(legacySkills.map((skill) => skill.skillId))
          await skillsTable.bulkAdd(migrateLegacySkills(legacySkills))
        }

        const reviewLogsTable = tx.table<ReviewLogRecord, number>('reviewLogs')
        await reviewLogsTable
          .filter((log) => log.skillId.endsWith(`::${LEGACY_VOCAB_RU_PL_DIMENSION}`))
          .modify((log) => {
            log.skillId = migrateLegacyReviewLogSkillId(log.skillId)
          })
      })
  }
}

/**
 * The one production singleton. Test code that wants an isolated database (rather than
 * sharing this module-level instance across test files) should construct
 * `new PolishLearningDatabase(uniqueName)` directly instead of importing `db`.
 *
 * `openDatabase()` / `deleteDatabase()` — the only lifecycle operations a caller outside
 * `src/db/**` legitimately needs (bootstrapping, and the `ErrorState` "reset database"
 * button) — live in `repositories/lifecycle.repository.ts`, not here, precisely so that
 * outside code imports *that* module and never this one: this file exports the raw `db`
 * handle itself, which is exactly what `eslint.config.js`'s `no-restricted-imports` rule
 * blocks from being imported outside `src/db/**` (this task's acceptance point 7).
 */
export const db = new PolishLearningDatabase()
