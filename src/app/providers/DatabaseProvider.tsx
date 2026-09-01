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
 */
import { useEffect, useState, type ReactNode } from 'react'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { ErrorState } from '@/components/app/ErrorState.tsx'
import { LoadingScreen } from '@/components/app/LoadingScreen.tsx'

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'ready' }

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Bumped by the retry/reset buttons to re-run the open effect below.
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
        message={state.error.message}
        onRetry={() => {
          setState({ status: 'loading' })
          setAttempt((n) => n + 1)
        }}
        secondaryAction={{
          label: 'Zresetuj lokalną bazę danych',
          onClick: () => {
            setState({ status: 'loading' })
            deleteDatabase()
              .catch(() => {
                // Deletion itself failing just means the next openDatabase() below fails
                // again and re-renders ErrorState — no separate error path needed.
              })
              .finally(() => setAttempt((n) => n + 1))
          },
        }}
      />
    )
  }

  return <>{children}</>
}
