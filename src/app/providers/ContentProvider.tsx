/**
 * `ContentProvider` (`spec/tasks/04-content-access-layer.md` §6).
 *
 * Loads `manifest.json` and `index.json` in parallel on mount, builds the module-level
 * index-store singleton (`content/index-store.ts`) once both resolve, and only then renders
 * `children`. Shows `LoadingScreen` while in flight and `ErrorState` (with a working retry)
 * on failure — including a codec/content version mismatch
 * (`loader.ts`'s `CodecVersionMismatchError`, thrown from inside `loadManifest()`).
 *
 * Deliberately minimal: no router, no `AppShell` (task 06's job) — just enough to gate
 * rendering on "the word index is ready" and expose the loaded `manifest` to whatever renders
 * inside it. Everything else content-related (`queryWords`, `getParadigm`, `getSenses`, ...)
 * is read through `content/**`'s own module-level singletons, not this context — see
 * `content/index-store.ts`'s file header for why `getIndexStore()` takes no argument.
 *
 * `useContent()` and the context object itself live in `content-context.ts`, not here — see
 * that file's header.
 *
 * task 25 addition: once the manifest resolves, this also fires (never awaits)
 * `prewarmSensesCache` and `cleanupStaleContentCaches` — see those modules' own headers.
 * Both are best-effort background work, not readiness gates: `children` renders as soon as
 * `manifest`+`index` are ready, exactly as before.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { loadIndex, loadManifest } from '@/content/loader.ts'
import { initIndexStore } from '@/content/index-store.ts'
import { prewarmSensesCache } from '@/content/senses-prewarm.ts'
import { cleanupStaleContentCaches } from '@/content/stale-cache-cleanup.ts'
import { ContentContext, type ContentContextValue } from './content-context.ts'
import { ErrorState } from '@/components/app/ErrorState.tsx'
import { LoadingScreen } from '@/components/app/LoadingScreen.tsx'

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'ready'; readonly value: ContentContextValue }

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Bumped by the retry button to re-run the load effect below. `loader.ts` already clears
  // its cached (rejected) promises on failure, so re-calling loadManifest()/loadIndex() here
  // genuinely retries the fetch rather than replaying the same rejection.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    Promise.all([loadManifest(), loadIndex()])
      .then(([manifest, rows]) => {
        if (cancelled) return
        initIndexStore(rows)
        setState({ status: 'ready', value: { manifest, wordCount: rows.length } })
        void prewarmSensesCache(manifest.contentVersion)
        void cleanupStaleContentCaches(manifest.contentVersion)
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
          // Set loading synchronously from the click handler (not from inside the effect
          // body) so the effect itself never calls setState synchronously on entry.
          setState({ status: 'loading' })
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return <ContentContext.Provider value={state.value}>{children}</ContentContext.Provider>
}
