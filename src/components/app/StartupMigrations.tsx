/**
 * One-shot startup data migrations that need the content layer already loaded.
 *
 * `spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2: `deriveStatus`
 * (`learning/progress/aggregate.ts`) refuses to call a word `known` before этап 2 is open
 * (FR-83), which makes every `wordProgress.status` computed under the old rule wrong until
 * that word is next answered. `wordProgress` is a pure cache of `computeWordProgress`, so one
 * `recomputeAll()` pass rebuilds it — guarded by `meta.repository.ts#runOnce` so it happens
 * exactly once per browser profile.
 *
 * This used to run from `DatabaseProvider.tsx`, right after `openDatabase()` resolved. Two
 * problems with that: `recomputeAll` → `computeWordProgress` calls `getIndexStore()` /
 * `getParadigm()`, both of which require `ContentProvider` to have already resolved
 * `initIndexStore()` — but `DatabaseProvider` sits *outside* `ContentProvider`
 * (`AppProviders.tsx`), so the migration threw "index store has not been initialized yet" for
 * any user who already had `skills` rows. And a failure there rendered the app's top-level
 * `ErrorState`, turning a pure-cache recompute into a hard boot failure — see
 * `words-progress.repository.ts#recomputeAll`'s header for the WebKit cursor bug that made
 * this concretely brick the app on some phones.
 *
 * Task 37 (`spec/tasks/37-three-stage-vocabulary.md` §3) needs the exact same kind of pass a
 * second time, for the exact same structural reason: `db/database.ts`'s `version(2)` Dexie
 * migration renames/backfills `skills` rows (schema-layer, runs inside `db.open()`, before
 * content is loaded), but `deriveStatus`'s new `productionGraduated` gate and the wider
 * `vocabMaturity` denominator both need `wordProgress` rebuilt from those rows — which is
 * exactly what `recomputeAll()` already does, just under a fresh `runOnce` key so it isn't
 * skipped for users whose `STAGE_STATUS_MIGRATION` key already ran back on task 28.
 *
 * Mounted inside `ContentProvider` (`AppProviders.tsx`), so both preconditions — open database,
 * loaded content index — actually hold by the time this effect runs. Deliberately renders
 * nothing and never surfaces its own `ErrorState`: the worst case of either migration failing
 * is a stale `wordProgress.status` until the affected word is next answered, not a blocked
 * app — `runOnce` only records success after its task resolves, so a failure is simply
 * retried on the next page load.
 */
import { useEffect, useRef } from 'react'
import { runOnce } from '@/db/repositories/meta.repository.ts'
import { recomputeAll } from '@/db/repositories/words-progress.repository.ts'

/** `meta` key for task 28's one-shot `wordProgress` recompute — see this file's header. */
const STAGE_STATUS_MIGRATION = 'recompute-word-progress-for-stage-gate'

/** `meta` key for task 37's own one-shot `wordProgress` recompute, after `version(2)`'s
 *  `skills` rename/backfill and the tightened `deriveStatus` gate — see this file's header. */
const THREE_STAGE_VOCAB_MIGRATION = 'recompute-word-progress-for-three-stage-vocab'

export function StartupMigrations() {
  // `main.tsx` renders under `StrictMode`, which double-invokes effects in development;
  // `runOnce` itself isn't atomic (it reads `meta`, then awaits `task()`, then writes `meta`),
  // so without this in-flight guard two concurrent `recomputeAll()` calls could both pass the
  // "does the key exist yet" check before either finishes.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    runOnce(STAGE_STATUS_MIGRATION, recomputeAll).catch((error: unknown) => {
      // Best-effort: never blocks rendering. See this file's header.
      console.warn('StartupMigrations: recompute-word-progress-for-stage-gate failed', error)
    })
    // Deliberately a second, independent `runOnce` call rather than folding into the one
    // above: the two migrations have different keys and different histories (many profiles
    // already have `STAGE_STATUS_MIGRATION` recorded from task 28), and `runOnce` itself
    // already serializes nothing across keys — running both concurrently is safe, `recomputeAll`
    // is idempotent and each call reads/writes the same `wordProgress` rows either way.
    runOnce(THREE_STAGE_VOCAB_MIGRATION, recomputeAll).catch((error: unknown) => {
      console.warn('StartupMigrations: recompute-word-progress-for-three-stage-vocab failed', error)
    })
  }, [])

  return null
}
