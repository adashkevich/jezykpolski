/**
 * `meta` table access (`spec/tasks/05-persistence.md` §6) — internal app bookkeeping, today
 * just the deployed content version.
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
