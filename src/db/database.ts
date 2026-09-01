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
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  DailyStatsRecord,
  ReviewLogRecord,
  SessionRecord,
  SkillRecord,
  WordProgressRecord,
} from '@/types/progress.ts'

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
