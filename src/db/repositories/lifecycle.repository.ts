/**
 * Database lifecycle (`spec/tasks/05-persistence.md` §7) — opening the database with a
 * user-facing error message, and the destructive full reset `ErrorState`'s "reset database"
 * button offers when opening fails outright (a corrupted DB can't be repaired, only deleted).
 *
 * Separated out from `db/database.ts` itself so that code outside `src/db/**` (concretely:
 * `app/providers/DatabaseProvider.tsx`) imports these two functions rather than the raw `db`
 * handle — `database.ts` exports `db` for use inside `src/db/**` only, enforced by
 * `eslint.config.js`'s `no-restricted-imports` rule (this task's acceptance point 7).
 */
import { db, type PolishLearningDatabase } from '../database.ts'

/**
 * Wraps `db.open()` with a descriptive error (`ErrorState`'s `message`) — opening IndexedDB
 * can fail in a private-browsing tab, over quota, or against a corrupted database, and the
 * raw `DOMException` message is not something to show a Polish-learner end user as-is.
 */
export async function openDatabase(): Promise<PolishLearningDatabase> {
  try {
    await db.open()
    return db
  } catch (error: unknown) {
    const cause = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Nie udało się otworzyć lokalnej bazy danych (IndexedDB). Może to być tryb prywatny ` +
        `przeglądarki, brak miejsca na dysku lub uszkodzone dane. Spróbuj ponownie lub ` +
        `zresetuj lokalną bazę danych. (${cause})`,
      { cause: error },
    )
  }
}

/** Distinct from `skills.repository.ts#resetWord`, which only forgets one word. */
export async function deleteDatabase(): Promise<void> {
  db.close()
  await db.delete()
}

/** `db.delete()` can hang forever if another tab still holds the database open (IndexedDB
 *  fires `onblocked`, never resolves/rejects the delete request) — race it against a timeout
 *  so the caller's `.finally()` still runs and the UI doesn't stay stuck on "Ładowanie…".
 *  `timeoutMs` is only a parameter so tests can exercise the "delete never settles" branch
 *  without a real 5s wait — `resetLocalState` below always uses the default. */
async function deleteDatabaseWithTimeout(timeoutMs = 5000): Promise<void> {
  db.close()
  await Promise.race([db.delete(), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}

/**
 * The `ErrorState` "reset local database" button's real action (`DatabaseProvider.tsx`).
 * Plain `deleteDatabase()` alone doesn't actually get a stuck user unstuck: it wipes `meta`
 * too, so a one-shot startup migration that failed structurally (not from corrupt data — e.g.
 * a WebKit build that throws `UnknownError: Unable to open cursor` on a specific IndexedDB
 * call regardless of what's stored) just fails again on the fresh empty database. And even if
 * IndexedDB alone were the problem, a stale service worker still serves the old broken bundle
 * from Cache Storage, so the fix that's already been deployed never reaches the phone.
 *
 * This clears every piece of persisted client state — IndexedDB, the two content Cache
 * Storage buckets (`content/cache-names.ts`), and the service worker registration — so that
 * the page reload `DatabaseProvider.tsx` does right after this resolves is forced to fetch a
 * completely fresh `index.html` + bundle from the network instead of the SW's precache.
 *
 * Each step is independently try/caught: one piece failing (e.g. no `caches` API in a very
 * old browser) shouldn't stop the others from still running.
 */
export async function resetLocalState(deleteTimeoutMs = 5000): Promise<void> {
  try {
    await deleteDatabaseWithTimeout(deleteTimeoutMs)
  } catch {
    // Best-effort — a reload afterwards is still worth attempting.
  }

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    } catch {
      // Best-effort.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    } catch {
      // Best-effort.
    }
  }
}
