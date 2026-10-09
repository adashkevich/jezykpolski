/**
 * `meta` table access (`spec/tasks/05-persistence.md` §6) — internal app bookkeeping: the
 * deployed content version, and one-shot startup migrations (`runOnce`).
 *
 * `syncContentVersion` implements the task text's startup rule: "если contentVersion в meta
 * не совпадает с manifest.json — записать новую. Прогресс не сбрасывать" — `wordId` is
 * stable across content builds (architecture.md, requirements.md conflict table #4/#8
 * context), so a version bump here is purely informational bookkeeping, never a trigger to
 * wipe `skills`/`wordProgress`/etc.
 */
import type { LevelValue } from '@/content/codec.ts'
import { db } from '../database.ts'

const CONTENT_VERSION_KEY = 'contentVersion'

export async function getContentVersion(): Promise<string | undefined> {
  const row = await db.meta.get(CONTENT_VERSION_KEY)
  return row === undefined ? undefined : (row.value as string)
}

export async function setContentVersion(version: string): Promise<void> {
  await db.meta.put({ key: CONTENT_VERSION_KEY, value: version })
}

/** Compares the stored `contentVersion` against `manifestVersion` and writes the new one if
 *  they differ (or nothing was stored yet). Returns whether a write happened, so a caller
 *  that cares (e.g. for logging) doesn't have to re-read. Never touches any other table. */
export async function syncContentVersion(manifestVersion: string): Promise<boolean> {
  const stored = await getContentVersion()
  if (stored === manifestVersion) return false
  await setContentVersion(manifestVersion)
  return true
}

// ---------------------------------------------------------------------------
// One-shot startup migrations (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2).
// ---------------------------------------------------------------------------

const ONCE_KEY_PREFIX = 'once:'

/**
 * Runs `task` at most once per browser profile, remembering that it ran in `meta`.
 *
 * For migrations that are *derived-data recomputes*, not schema changes: Dexie's own
 * `version().upgrade()` is the right tool when the table shape changes, but a rule change in
 * pure domain code (e.g. task 28's `deriveStatus` gate, which makes every stored
 * `wordProgress.status` computed under the old rule stale) needs no schema bump at all — it
 * needs one `recomputeAll()` pass over data that is already a cache. Recording the key here
 * keeps that pass off every subsequent startup.
 *
 * Returns whether `task` actually ran. The key is only written *after* `task` resolves, so a
 * failed migration is retried on the next startup rather than silently skipped forever.
 */
export async function runOnce(key: string, task: () => Promise<void>): Promise<boolean> {
  const storageKey = `${ONCE_KEY_PREFIX}${key}`
  const existing = await db.meta.get(storageKey)
  if (existing !== undefined) return false

  await task()
  await db.meta.put({ key: storageKey, value: true })
  return true
}

// ---------------------------------------------------------------------------
// One-time "dictionary updated" notice (`spec/tasks/49-primary-sense-learning-and-level-reset.md`
// §1) — written by `content-v2-level-reset.repository.ts`, read and deleted by the home screen's
// banner (`features/content-update`).
// ---------------------------------------------------------------------------

const CONTENT_V2_NOTICE_KEY = 'contentV2Notice'

/** What the banner needs that isn't derivable from the content index at render time: the
 *  `newWordsStartLevel` the user had before the reset (the banner mentions it when it was above
 *  A1) and when the reset happened. The count of words left is deliberately NOT stored — it is
 *  read live from the index and the user's progress. */
export interface ContentV2Notice {
  readonly previousStartLevel: LevelValue
  /** Epoch ms of the reset. */
  readonly at: number
}

export async function getContentV2Notice(): Promise<ContentV2Notice | undefined> {
  const row = await db.meta.get(CONTENT_V2_NOTICE_KEY)
  return row === undefined ? undefined : (row.value as ContentV2Notice)
}

export async function setContentV2Notice(notice: ContentV2Notice): Promise<void> {
  await db.meta.put({ key: CONTENT_V2_NOTICE_KEY, value: notice })
}

/** Dismissal: deletes the key outright, so the banner never comes back. */
export async function clearContentV2Notice(): Promise<void> {
  await db.meta.delete(CONTENT_V2_NOTICE_KEY)
}
