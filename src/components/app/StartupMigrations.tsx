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
 * Task 48 (`spec/tasks/48-progress-migration-word-id-renames.md` §2) adds the first step that
 * rewrites progress itself rather than just its cache: `word-id-renames-v2` moves `skills`/
 * `reviewLogs` of the 37 `wordId`s renamed in dictionary v2 onto their new ids
 * (`db/repositories/word-id-renames.repository.ts#runWordIdRenamesMigration`), then rebuilds
 * `wordProgress`. It needs content for the same reason (dimensions of the new word come from
 * its paradigm), and it must run FIRST: until it lands, `skills` may hold `wordId`s the v2 index
 * doesn't know, and `recomputeAll` — which both older steps run — throws on those.
 *
 * Task 49 (`spec/tasks/49-primary-sense-learning-and-level-reset.md` §1) appends the last step,
 * `content-v2-level-reset`: a user who had raised `newWordsStartLevel` gets it back to A1 (the
 * dictionary change moved ~790 unstarted words into A1) and a one-time home-screen notice is
 * left in `meta` (`db/repositories/content-v2-level-reset.repository.ts`). It reads and writes
 * only `settings`/`meta` and counts `skills`, so it needs no content — but it stays after task
 * 48's step, as the spec says.
 *
 * The steps therefore run one after another, in `STARTUP_MIGRATIONS` order, not concurrently;
 * each one's failure is caught and logged on its own and never stops the next (the key of a
 * failed step stays unwritten, so it is retried on the next start).
 *
 * Mounted inside `ContentProvider` (`AppProviders.tsx`), so both preconditions — open database,
 * loaded content index — actually hold by the time this effect runs. Deliberately renders
 * nothing and never surfaces its own `ErrorState`: the worst case of a recompute failing is a
 * stale `wordProgress.status` until the affected word is next answered, and of task 48's step
 * failing (e.g. a paradigm shard it needs can't be fetched offline) — renamed words' progress
 * staying under the old ids, untouched, for one more start; never a blocked app. `runOnce`
 * only records success after its task resolves, so a failure is simply retried on the next
 * page load.
 */
import { useEffect, useRef } from 'react'
import {
  CONTENT_V2_LEVEL_RESET_MIGRATION,
  runContentV2LevelReset,
} from '@/db/repositories/content-v2-level-reset.repository.ts'
import { runOnce } from '@/db/repositories/meta.repository.ts'
import { runWordIdRenamesMigration } from '@/db/repositories/word-id-renames.repository.ts'
import { recomputeAll } from '@/db/repositories/words-progress.repository.ts'

/** `meta` key for task 28's one-shot `wordProgress` recompute — see this file's header. */
const STAGE_STATUS_MIGRATION = 'recompute-word-progress-for-stage-gate'

/** `meta` key for task 37's own one-shot `wordProgress` recompute, after `version(2)`'s
 *  `skills` rename/backfill and the tightened `deriveStatus` gate — see this file's header. */
const THREE_STAGE_VOCAB_MIGRATION = 'recompute-word-progress-for-three-stage-vocab'

/** `meta` key for task 48's move of progress onto the `wordId`s renamed in dictionary v2. */
const WORD_ID_RENAMES_MIGRATION = 'word-id-renames-v2'

/**
 * Run in this order, each awaited before the next (see this file's header). Task 48's step
 * leads: the two task 28/37 recomputes call `recomputeAll`, which throws on a `wordId` the
 * index doesn't know — exactly what un-migrated renamed rows are. Task 49's
 * `content-v2-level-reset` step comes after task 48's (its spec, §1).
 */
const STARTUP_MIGRATIONS: ReadonlyArray<readonly [key: string, task: () => Promise<void>]> = [
  [WORD_ID_RENAMES_MIGRATION, runWordIdRenamesMigration],
  [STAGE_STATUS_MIGRATION, recomputeAll],
  [THREE_STAGE_VOCAB_MIGRATION, recomputeAll],
  [CONTENT_V2_LEVEL_RESET_MIGRATION, runContentV2LevelReset],
]

async function runStartupMigrations(): Promise<void> {
  for (const [key, task] of STARTUP_MIGRATIONS) {
    try {
      await runOnce(key, task)
    } catch (error: unknown) {
      // Best-effort: never blocks rendering, never stops the next step. See this file's header.
      console.warn(`StartupMigrations: ${key} failed`, error)
    }
  }
}

export function StartupMigrations() {
  // `main.tsx` renders under `StrictMode`, which double-invokes effects in development;
  // `runOnce` itself isn't atomic (it reads `meta`, then awaits `task()`, then writes `meta`),
  // so without this in-flight guard two concurrent runs of the same step could both pass the
  // "does the key exist yet" check before either finishes.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    void runStartupMigrations()
  }, [])

  return null
}
