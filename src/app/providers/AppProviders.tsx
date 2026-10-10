import type { ReactNode } from 'react'
import { ContentProvider } from './ContentProvider.tsx'
import { DatabaseProvider } from './DatabaseProvider.tsx'
import { useThemeSync } from '@/features/settings/hooks/useThemeSync.ts'
import { StoragePersistRequest } from '@/components/app/StoragePersistRequest.tsx'
import { StartupMigrations } from '@/components/app/StartupMigrations.tsx'
import { LangProfileGate } from '@/features/lang-onboarding/components/LangProfileGate.tsx'

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
 * Renders nothing of its own beyond that gating — with one task-24 addition: `<ThemeSync />`
 * is mounted as a sibling of `<ContentProvider>`, inside `<DatabaseProvider>` (so the `settings`
 * table it reads is guaranteed open), applying the persisted theme class to `<html>` for every
 * route, not just while `/settings` happens to be mounted. It renders nothing itself — see
 * `features/settings/hooks/useThemeSync.ts`.
 *
 * Task-25 addition, same pattern: `<StoragePersistRequest />` is another silent sibling here
 * (needs the `skills` table open, same reason `ThemeSync` sits inside `DatabaseProvider`) —
 * see `components/app/StoragePersistRequest.tsx`.
 *
 * `<StartupMigrations />` is mounted *inside* `<ContentProvider>` rather than as a sibling of
 * `ThemeSync`/`StoragePersistRequest` — unlike those two, it needs the content index loaded
 * (`getIndexStore()`), not just the database open. See that component's own header for why it
 * used to live in `DatabaseProvider` and why that was broken. `wordProgress` being briefly
 * stale after a fresh recompute pass is fine — every reader of it is on `useLiveQuery` and
 * rerenders once `recomputeAll()`'s `bulkPut` lands.
 *
 * Task 52 (`spec/tasks/52-language-onboarding.md`): `<LangProfileGate>` wraps `children` inside
 * `ContentProvider` — the first-run language screen replaces the app (router included) until
 * `settings.langProfile` holds a known profile, and it applies the chosen profile to the loaded
 * index. `StartupMigrations` stays outside the gate: the migrations are about data, not about
 * which screen is up, and they should run on the very first start too.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider>
      <ThemeSync />
      <StoragePersistRequest />
      <ContentProvider>
        <StartupMigrations />
        <LangProfileGate>{children}</LangProfileGate>
      </ContentProvider>
    </DatabaseProvider>
  )
}

function ThemeSync() {
  useThemeSync()
  return null
}
