/**
 * `settings` table access (`spec/tasks/05-persistence.md` §6) — user-facing preferences
 * (theme, daily goal, etc). Generic key/value; each caller supplies its own `T` and
 * `fallback`, so this file doesn't need to know the app's full settings shape.
 */
import { db } from '../database.ts'

export async function get<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function set<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value })
}

/** Deletes a key entirely (as opposed to `set`-ing it to some "empty" value). Needed by
 *  `zustand/middleware/persist`'s `PersistStorage.removeItem` contract (`stores/filters.store.ts`
 *  uses this repository as its persist backend) — that middleware calls it on `persist.clearStorage()`,
 *  which no current caller exercises in practice, but the interface requires it. */
export async function remove(key: string): Promise<void> {
  await db.settings.delete(key)
}
