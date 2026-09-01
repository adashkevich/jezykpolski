/**
 * On-demand paradigm loading for `WordDetailPage` (`spec/tasks/08-word-detail.md` §6,
 * acceptance point 9: "Парадигма не загружается, пока блок форм не раскрыт").
 *
 * `getParadigm` (task 04, `content/paradigms.ts`) is a plain async function with no loading
 * state of its own — this hook is the thin React wrapper that turns "call `load()` once, on
 * the user's own click" into `status`/`paradigm`/`error` a component can render against,
 * without fetching anything until `load()` is actually invoked.
 *
 * `WordDetailPage` shares ONE instance of this hook's result between `FormsSection` (which
 * calls `load()` when the user expands "Формы слова") and `ProgressSection` (which reads
 * `paradigm` — possibly still `undefined` — for its per-dimension breakdown, but never calls
 * `load()` itself). This is a deliberate single source of truth, not two independent
 * fetches: the task text's step 6 names the *forms block* as the lazy-load trigger, and the
 * per-case/per-tense breakdown is morphology-derived data that has nothing to compute until
 * that same paradigm is loaded anyway (see `ProgressSection.tsx`'s header for the resulting
 * UI: the breakdown shows a "expand Форми слова first" hint instead of fetching on its own).
 */
import { useCallback, useRef, useState } from 'react'
import { getParadigm } from '@/content/paradigms.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'

export type LazyParadigmStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface LazyParadigm {
  readonly status: LazyParadigmStatus
  /** `undefined` before the first `load()` resolves; `null` only in the (should-not-happen
   *  for a caller that already checked `paradigmShard !== -1`) case `getParadigm` itself
   *  returns `null`. */
  readonly paradigm: Paradigm | null | undefined
  readonly error: Error | undefined
  /** Idempotent: calling it again while already loading/loaded for the same `wordId` does
   *  not issue a second fetch (and `content/loader.ts`'s own per-shard cache would dedupe it
   *  anyway even if it did — this is just avoiding the redundant state churn). */
  readonly load: () => void
}

export function useLazyParadigm(wordId: WordId): LazyParadigm {
  const [status, setStatus] = useState<LazyParadigmStatus>('idle')
  const [paradigm, setParadigm] = useState<Paradigm | null | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  // Tracks which wordId the current status/paradigm/error actually belong to, so a response
  // for a word the user has since navigated away from never overwrites the next word's
  // state. Deliberately NOT reset in the render-time block below — refs must not be written
  // during render (`react-hooks/refs`) — but it doesn't need to be: once `wordId` changes,
  // this ref still holds the *previous* word's id, which already fails the `=== wordId`
  // check at the top of `load()` below, so `load()` naturally fetches again for the new word
  // without needing an explicit reset first.
  const requestedFor = useRef<WordId | null>(null)

  // A new wordId (route param changed while this page instance stays mounted) always starts
  // fully idle again — the previous word's paradigm must never bleed into the new word's
  // "Формы слова" block before the user re-expands it. Reset happens during render (React's
  // "adjusting state when a prop changes" pattern), not as a synchronous `setState` at the
  // top of a `useEffect`, which `react-hooks/set-state-in-effect` flags — same fix
  // `useSenses.ts` uses for its own wordId-changed reset; see that file's comment.
  const [lastSeenWordId, setLastSeenWordId] = useState(wordId)
  if (wordId !== lastSeenWordId) {
    setLastSeenWordId(wordId)
    setStatus('idle')
    setParadigm(undefined)
    setError(undefined)
  }

  const load = useCallback(() => {
    if (requestedFor.current === wordId) return
    requestedFor.current = wordId
    setStatus('loading')
    setError(undefined)

    getParadigm(wordId)
      .then((result) => {
        if (requestedFor.current !== wordId) return
        setParadigm(result)
        setStatus('loaded')
      })
      .catch((err: unknown) => {
        if (requestedFor.current !== wordId) return
        // Allow a retry: a failed request must not permanently look "already requested".
        requestedFor.current = null
        setError(err instanceof Error ? err : new Error(String(err)))
        setStatus('error')
      })
  }, [wordId])

  return { status, paradigm, error, load }
}
