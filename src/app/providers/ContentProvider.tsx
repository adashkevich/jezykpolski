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
 *
 * Task 51 (`spec/tasks/51-language-profile.md` §2): the index is built for the `langProfile`
 * setting, read alongside the two fetches so the first screen already counts levels in the
 * right column. After that this provider watches the setting (`useLiveQuery`, the same
 * "live query + effect" shape as `useThemeSync`) and hands every change to
 * `setIndexStoreLangs` — whether it came from the settings screen or a backup import. The
 * store notifies its subscribers (`hooks/useKnownLangs.ts`), so the switch applies without a
 * reload; the context value below doesn't change with it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadIndex, loadManifest } from '@/content/loader.ts'
import { initIndexStore, setIndexStoreLangs } from '@/content/index-store.ts'
import { readKnownLangsSetting } from '@/hooks/useKnownLangs.ts'
import { DEFAULT_KNOWN_LANGS } from '@/learning/session/lang-profile.ts'
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
  const liveLangs = useLiveQuery(readKnownLangsSetting, [])
  const ready = state.status === 'ready'

  useEffect(() => {
    if (ready && liveLangs !== undefined) setIndexStoreLangs(liveLangs)
  }, [ready, liveLangs])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      loadManifest(),
      loadIndex(),
      // A preference: failing to read it must not keep the content from loading.
      readKnownLangsSetting().catch(() => DEFAULT_KNOWN_LANGS),
    ])
      .then(([manifest, rows, langs]) => {
        if (cancelled) return
        initIndexStore(rows, langs)
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
