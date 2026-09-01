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
