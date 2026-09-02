/**
 * `useWordProgressSummary` (`spec/tasks/15-home-screen.md` §3) — live "изучается / выучено"
 * counters for the home screen, overall and per part of speech.
 *
 * Thin `useLiveQuery` wrapper around `words-progress.repository.ts#getWordProgressSummary`,
 * which does the actual index-only aggregation (`status` index `.primaryKeys()`, never
 * `.toArray()` over the whole `wordProgress` table — see that function's header). `dexie-
 * react-hooks` tracks which tables/indexes a live query actually touched during execution,
 * so this re-runs on any `wordProgress` write (`applyAnswer`, `resetWord`, `recomputeAll`)
 * without this hook needing to name those tables itself.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getWordProgressSummary,
  type WordProgressSummary,
} from '@/db/repositories/words-progress.repository.ts'

/** `undefined` while the first query is still in flight. */
export function useWordProgressSummary(): WordProgressSummary | undefined {
  return useLiveQuery(() => getWordProgressSummary(), [])
}
