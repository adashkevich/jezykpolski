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
 */
import { useEffect, useState } from 'react'
import { getSenses } from '@/content/senses.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Sense } from '@/types/content.ts'

export type SensesStatus = 'loading' | 'ready' | 'error'

export interface UseSensesResult {
  readonly status: SensesStatus
  readonly senses: readonly Sense[]
  readonly error: Error | undefined
}

export function useSenses(wordId: WordId): UseSensesResult {
  const [status, setStatus] = useState<SensesStatus>('loading')
  const [senses, setSenses] = useState<readonly Sense[]>([])
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

  return { status, senses, error }
}
