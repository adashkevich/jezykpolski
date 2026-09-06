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
