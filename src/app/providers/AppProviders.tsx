import type { ReactNode } from 'react'
import { ContentProvider } from './ContentProvider.tsx'
import { DatabaseProvider } from './DatabaseProvider.tsx'

/**
 * Composes the two readiness gates every route needs before it can render for real
 * (`spec/tasks/06-app-shell-pwa.md` §1's "подключи оба провайдера" requirement — they existed
 * since tasks 04/05 but were never mounted anywhere until this task).
 *
 * `DatabaseProvider` is outermost: `ContentProvider`'s own `LoadingScreen`/`ErrorState` are
 * rendered *by* `ContentProvider`, so if it were outermost and `DatabaseProvider` then failed,
 * the user would see content flash ready before the DB error screen replaced it. Nesting
 * `DatabaseProvider` first means at most one of the two full-screen states is ever visible at
 * a time, in a fixed, predictable order (DB, then content) — not a performance optimization
 * (the two loads still run sequentially, not in parallel; each provider fully gates its own
 * `children`), just a deliberate, deterministic order over an arbitrary one.
 *
 * Renders nothing of its own — by the time `children` (the router, in practice) mounts, both
 * IndexedDB is open and the word index is loaded, so pages never need to know either provider
 * exists.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider>
      <ContentProvider>{children}</ContentProvider>
    </DatabaseProvider>
  )
}
