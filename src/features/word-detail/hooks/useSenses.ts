/**
 * Loads every sense (meaning) of a word for `WordDetailPage` (`spec/tasks/08-word-detail.md`
 * §2, FR-41). Unlike the paradigm (§6 of the task text — lazy, only on demand), senses load
 * eagerly on mount: the task text's step 6 only calls out the paradigm shard as something to
 * defer ("незачем тянуть его, если пользователь смотрит только перевод") — the whole point
 * of opening a word's card in the first place is to read its meanings, and the senses shard
 * is far smaller than a paradigm shard (`spec/architecture.md` §4.2: ~24 KB gz vs ~15 KB gz
 * *per shard*, but paradigms shard 4x more words per file at similar total size — either
 * way, nothing in the task text asks for senses to be deferred).
 *
 * Thin wrapper over `content/senses.ts#getSenses` (task 04) — no new loading/caching logic,
 * just the React plumbing `getSenses` itself deliberately doesn't have (it's a plain
 * `content/**` async function, not a hook).
 *
 * Task 50 (`spec/tasks/50-word-detail-senses-v2.md` §1) adds the display-only details (Polish
 * gloss and example) from the lazy `sense-details` shard (`getSenseDetails`). They load
 * SEPARATELY: the translations show as soon as the senses shard is in, the details fill in
 * when theirs arrives, and a failed details load — the normal case offline, with that shard
 * never cached — is swallowed on purpose: `details` just stays empty and the list shows
 * translations only, no error message.
 */
import { useEffect, useState } from 'react'
import { getSenseDetails, getSenses } from '@/content/senses.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Sense, SenseDetails, SenseId } from '@/types/content.ts'

export type SensesStatus = 'loading' | 'ready' | 'error'

export type SenseDetailsById = ReadonlyMap<SenseId, SenseDetails>

const NO_DETAILS: SenseDetailsById = new Map()

export interface UseSensesResult {
  readonly status: SensesStatus
  readonly senses: readonly Sense[]
  /** Polish gloss/example per sense id. Empty until the details shard arrives — and for good
   *  if it never does (offline, never cached); a sense missing from it is simply absent. */
  readonly details: SenseDetailsById
  readonly error: Error | undefined
}

export function useSenses(wordId: WordId): UseSensesResult {
  const [status, setStatus] = useState<SensesStatus>('loading')
  const [senses, setSenses] = useState<readonly Sense[]>([])
  const [details, setDetails] = useState<SenseDetailsById>(NO_DETAILS)
  const [error, setError] = useState<Error | undefined>(undefined)
  // Tracks the last `wordId` this hook's state actually belongs to. When `wordId` changes
  // (route param navigation while the page stays mounted), reset happens right here, during
  // render — React's own "adjusting state when a prop changes" pattern — rather than as a
  // synchronous `setState` at the top of the effect below, which `react-hooks/
  // set-state-in-effect` flags (same fix `features/words-list/components/SearchInput.tsx`
  // already uses for the analogous "external value changed, resync local state" case).
  const [lastSeenWordId, setLastSeenWordId] = useState(wordId)
  if (wordId !== lastSeenWordId) {
    setLastSeenWordId(wordId)
    setStatus('loading')
    setSenses([])
    setDetails(NO_DETAILS)
    setError(undefined)
  }

  useEffect(() => {
    let cancelled = false

    getSenses(wordId)
      .then((result) => {
        if (cancelled) return
        setSenses(result)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [wordId])

  useEffect(() => {
    let cancelled = false

    getSenseDetails(wordId)
      .then((result) => {
        if (!cancelled) setDetails(result)
      })
      .catch(() => {
        // Deliberately silent (task 50 §1): no details shard offline is a normal situation,
        // and the translations above are complete without them.
      })

    return () => {
      cancelled = true
    }
  }, [wordId])

  return { status, senses, details, error }
}
