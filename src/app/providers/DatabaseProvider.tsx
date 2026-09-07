/**
 * `DatabaseProvider` (`spec/tasks/05-persistence.md` §7, acceptance point 8).
 *
 * Opening IndexedDB can fail — private browsing, storage quota, a corrupted database
 * (blueprint §19 names "IndexedDB initialization" as exactly the kind of "meaningful
 * boundary" that needs a real `ErrorState`, not a blank screen or an uncaught rejection).
 * This component is that boundary for `db/database.ts`'s `openDatabase()`: it shows
 * `LoadingScreen` while `db.open()` is in flight, `children` once it succeeds, and
 * `ErrorState` — with both a plain retry and a destructive "reset the local database" button
 * — if it fails.
 *
 * Deliberately minimal, same scope as `ContentProvider.tsx`: no router, no `AppShell` (task
 * 06's job) — just enough to gate rendering on "the database is open". Wiring this (and
 * `ContentProvider`) into the real app tree happens in task 06.
 *
 * This used to also run task 28's one-shot `wordProgress` recompute migration right after
 * `openDatabase()` resolved, guarded by `meta.repository.ts#runOnce`. Two problems with that:
 * (1) that migration needs the content index loaded (`getIndexStore()`), but this provider
 * sits *outside* `ContentProvider` (see `AppProviders.tsx`), so it threw "index store has not
 * been initialized yet" for any user who already had `skills` rows; and (2) its own
 * `db.skills.orderBy('wordId').uniqueKeys()` opens an IndexedDB cursor that some WebKit/iOS
 * builds reject outright with `UnknownError: Unable to open cursor` — bricking the whole app
 * on startup, on every retry, and even after "reset local database" (which just re-entered
 * the same failing call on a fresh, empty store). The migration now lives in
 * `StartupMigrations.tsx`, mounted inside `ContentProvider` where its precondition actually
 * holds, and its failure no longer blocks rendering at all — see that file's header.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { openDatabase, resetLocalState } from '@/db/repositories/lifecycle.repository.ts'
import { ErrorState } from '@/components/app/ErrorState.tsx'
import { LoadingScreen } from '@/components/app/LoadingScreen.tsx'

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'ready' }

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Bumped by the retry button to re-run the open effect below.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    openDatabase()
      .then(() => {
        if (cancelled) return
        setState({ status: 'ready' })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  if (state.status === 'loading') {
    return <LoadingScreen />
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="Nie udało się otworzyć lokalnej bazy danych"
        message={state.error.message}
        onRetry={() => {
          setState({ status: 'loading' })
          setAttempt((n) => n + 1)
        }}
        secondaryAction={{
          label: 'Zresetuj lokalną bazę danych (utracisz postępy)',
          onClick: () => {
            setState({ status: 'loading' })
            // A full page reload — not just `setAttempt(n => n + 1)` — is the point: after
            // `resetLocalState()` unregisters the service worker and clears Cache Storage,
            // only a real navigation forces the browser to fetch a fresh `index.html` and
            // bundle from the network instead of replaying whatever the (possibly stale,
            // possibly broken) precache still holds. That's what makes this button able to
            // actually deliver an already-deployed fix to a phone stuck on the old code.
            resetLocalState().finally(() => {
              window.location.reload()
            })
          },
        }}
      />
    )
  }

  return <>{children}</>
}
