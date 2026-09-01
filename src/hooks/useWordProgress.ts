/**
 * `useWordProgress` (`spec/tasks/05-persistence.md` §8) — live denormalized progress for one
 * word (status badge + maturity bars on `WordDetailPage` / list rows) or for every word at
 * once (the `/words` list's status filter — architecture.md §5.5's whole reason for
 * `wordProgress` existing is to avoid recomputing 7998 aggregates per render).
 *
 * Built on `useLiveQuery` so components never write a Dexie query themselves (NFR-12, this
 * task's acceptance point 7).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getAllWordProgress, getWordProgress } from '@/db/repositories/words-progress.repository.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { WordProgressRecord } from '@/types/progress.ts'

/** `undefined` while loading, and also (indistinguishably) for a word with no progress yet
 *  — a word with no `wordProgress` row is `status: 'new'` by construction (architecture.md
 *  §5.2), so callers that need to tell "loading" from "genuinely new" apart should treat any
 *  render before the live query's first result as loading and anything after as settled. */
export function useWordProgress(wordId: WordId): WordProgressRecord | undefined {
  return useLiveQuery(() => getWordProgress(wordId), [wordId])
}

export function useAllWordProgress(): Map<WordId, WordProgressRecord> | undefined {
  return useLiveQuery(() => getAllWordProgress(), [])
}
