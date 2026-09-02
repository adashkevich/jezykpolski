/**
 * Zod schema for the backup export/import JSON (`spec/tasks/24-settings-backup.md` §2/§3,
 * `spec/requirements.md` NFR-16: "экспорт содержит `schemaVersion`; импорт валидируется до
 * записи в БД"). Mirrors `src/content/content.schema.ts`'s own convention (one Zod object
 * schema per record shape, `z.infer` for the TS type) — this is the same "never trust
 * external structure" discipline, just applied to a file the *user* can hand-edit or replace
 * (a downloaded JSON backup) rather than a build-time content artifact.
 *
 * Field shapes mirror `src/types/progress.ts` record-for-record. Kept as an independent
 * schema (not derived from those interfaces via some z-from-ts codegen) because a backup
 * file is untrusted input — every field genuinely needs its own runtime check, not just a
 * compile-time cast; `types/progress.ts` itself has no Zod schema of its own (it's an
 * internal DB shape, always written by trusted repository code, never parsed from JSON)
 * hence this file, not that one, is where the schema belongs.
 *
 * `wordProgress` is deliberately absent — the task text's own rule: it's a denormalized
 * cache of `skills`, rebuilt by `words-progress.repository.ts#recomputeAll` after import,
 * never part of the export/import contract at all.
 */
import { z } from 'zod'

/** Bumped only on a genuine breaking change to this file's shape. `db/repositories/
 *  backup.repository.ts#parseBackupJson` refuses to import any other value (task text §3
 *  step 3: "неизвестная версия → отказ с понятным сообщением") — a lower *or* higher number
 *  is equally "unknown" to this build, there is no partial-compatibility story. */
export const CURRENT_BACKUP_SCHEMA_VERSION = 1

const SkillKindSchema = z.enum(['vocab', 'noun', 'verb', 'adj', 'adv'])
const SkillStateSchema = z.enum(['new', 'learning', 'review', 'relearning'])
const RatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
const SessionModeSchema = z.enum(['learn', 'practice', 'mistakes'])

export const BackupSkillRecordSchema = z.object({
  skillId: z.string().min(1),
  wordId: z.string().min(1),
  kind: SkillKindSchema,
  dimension: z.string().min(1),
  state: SkillStateSchema,
  stability: z.number(),
  difficulty: z.number(),
  due: z.number(),
  lastReviewAt: z.number().optional(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const BackupReviewLogRecordSchema = z.object({
  id: z.number().int().optional(),
  sessionId: z.number().int(),
  skillId: z.string().min(1),
  wordId: z.string().min(1),
  exerciseType: z.string().min(1),
  reviewedAt: z.number(),
  rating: RatingSchema,
  correct: z.boolean(),
  answerGiven: z.string(),
  expected: z.string(),
  elapsedMs: z.number().nonnegative(),
  srsApplied: z.boolean(),
})

export const BackupSessionRecordSchema = z.object({
  id: z.number().int().optional(),
  mode: SessionModeSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  totalCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  newSkillCount: z.number().int().nonnegative(),
  reviewedSkillCount: z.number().int().nonnegative(),
})

export const BackupDailyStatsRecordSchema = z.object({
  date: z.string().min(1),
  reviewsCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  newSkillsStarted: z.number().int().nonnegative(),
  sessionsCount: z.number().int().nonnegative(),
  timeSpentMs: z.number().nonnegative(),
  updatedAt: z.number(),
})

/** `settings` exports as a plain `{ key: value }` object (task text §2's example JSON:
 *  `"settings": {}`), not an array of rows like the other tables — it mirrors how the app
 *  itself thinks about settings (a flat key/value bag, `settings.repository.ts#get/set`),
 *  and keeps the export file's most human-glanceable section actually readable. `z.unknown()`
 *  values: a setting's value shape is opaque to this layer (bool, number, or a nested object
 *  like `PracticeConfig`) — every *consumer* of a given key already defends its own fallback
 *  default (`settings.repository.ts`'s whole design), so re-typing every known key here would
 *  duplicate that and still not catch a value shape from some future settings key this schema
 *  doesn't know about yet.
 */
export const BackupExportSchema = z.object({
  schemaVersion: z.number().int(),
  exportedAt: z.string().min(1),
  contentVersion: z.string(),
  skills: z.array(BackupSkillRecordSchema),
  reviewLogs: z.array(BackupReviewLogRecordSchema),
  sessions: z.array(BackupSessionRecordSchema),
  dailyStats: z.array(BackupDailyStatsRecordSchema),
  settings: z.record(z.string(), z.unknown()),
})

export type BackupExport = z.infer<typeof BackupExportSchema>

/** Step 2 failure (task text §3): the JSON doesn't even match the expected shape — missing
 *  fields, wrong types, not an object at all. Distinct from
 *  {@link UnknownBackupSchemaVersionError} (step 3) so a caller/UI can tell "this isn't a
 *  backup file at all" from "this IS a backup file, just one this build can't read". */
export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

/** Step 3 failure: the file parses as a structurally valid backup, but declares a
 *  `schemaVersion` this build doesn't understand. */
export class UnknownBackupSchemaVersionError extends Error {
  // Plain field declarations + explicit assignment, not constructor parameter-property
  // shorthand — `tsconfig.app.json`'s `erasableSyntaxOnly` forbids the shorthand (it isn't
  // just type-erasable, it also emits a real assignment).
  readonly foundVersion: number
  readonly supportedVersion: number

  constructor(foundVersion: number, supportedVersion: number) {
    super(
      `Этот файл экспортирован версией формата бэкапа ${foundVersion}, а текущая версия ` +
        `приложения понимает только версию ${supportedVersion}. Обновите приложение до ` +
        `последней версии или используйте файл, экспортированный текущей версией.`,
    )
    this.name = 'UnknownBackupSchemaVersionError'
    this.foundVersion = foundVersion
    this.supportedVersion = supportedVersion
  }
}

/**
 * Steps 2-3 of the task text's import order, combined: parse the shape with Zod (NFR-16),
 * then separately gate on `schemaVersion` — kept as two distinct checks (not one schema with
 * `schemaVersion: z.literal(CURRENT_BACKUP_SCHEMA_VERSION)`) precisely so an old/future/
 * corrupt-version file still gets the friendlier {@link UnknownBackupSchemaVersionError}
 * message instead of falling into the generic "file is malformed" bucket — a `schemaVersion`
 * of `2` is a well-formed, just-unsupported file, not garbage.
 *
 * Never throws anything other than the two error classes above — a raw `SyntaxError` from
 * `JSON.parse`-ing an actually-corrupt file happens one layer up, in whichever caller reads
 * the `File` (task text step 1, `features/settings/lib/backup-io.ts#readBackupFile`), before
 * this function ever sees a value.
 */
export function parseBackupJson(raw: unknown): BackupExport {
  const shapeResult = BackupExportSchema.safeParse(raw)
  if (!shapeResult.success) {
    const firstIssues = shapeResult.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new BackupValidationError(
      `Файл повреждён или имеет неверную структуру и не может быть импортирован. ` +
        `${firstIssues}`,
    )
  }
  if (shapeResult.data.schemaVersion !== CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new UnknownBackupSchemaVersionError(
      shapeResult.data.schemaVersion,
      CURRENT_BACKUP_SCHEMA_VERSION,
    )
  }
  return shapeResult.data
}
