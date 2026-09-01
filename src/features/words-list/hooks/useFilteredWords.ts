/**
 * Wires `filters.store.ts` to `content/query.ts#queryWords` (`spec/tasks/07-words-list.md`
 * §3/§4/§6) — this is the ONLY place `/words` runs a query; `WordsListPage` and its children
 * never call `queryWords` themselves, and never re-derive filtering/search logic
 * (`content/query.ts` already owns that, task 04).
 *
 * `useAllWordProgress()` (task 05, `useLiveQuery`) is fetched exactly once here and threaded
 * down as a plain `Map`, per the task text's step 6: "загружать один раз... не запрашивать
 * на каждую строку".
 */
import { useMemo } from 'react'
import { queryWords, type WordQuery } from '@/content/query.ts'
import { useAllWordProgress } from '@/hooks/useWordProgress.ts'
import { filtersToQuery, useFiltersStore } from '@/stores/filters.store.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { WordProgressRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'

export interface FilteredWords {
  readonly query: WordQuery
  readonly results: readonly WordIndexEntry[]
  /** Not `ReadonlyMap` — `content/query.ts#queryWords` takes a plain `Map` (it never mutates
   *  it, but its signature predates this hook and isn't this task's file to change). */
  readonly progress: Map<WordId, WordProgressRecord>
  /** `true` until `useAllWordProgress()`'s live query has resolved at least once — see that
   *  hook's own doc comment for why this is otherwise indistinguishable from "no progress
   *  yet" (a freshly-installed app also has an empty map once loaded, not `undefined`). */
  readonly isLoadingProgress: boolean
}

export function useFilteredWords(): FilteredWords {
  const levels = useFiltersStore((s) => s.levels)
  const upToMode = useFiltersStore((s) => s.upToMode)
  const upToLevel = useFiltersStore((s) => s.upToLevel)
  const pos = useFiltersStore((s) => s.pos)
  const status = useFiltersStore((s) => s.status)
  const topN = useFiltersStore((s) => s.topN)
  const sort = useFiltersStore((s) => s.sort)
  const search = useFiltersStore((s) => s.search)

  const progressMaybe = useAllWordProgress()
  const progress = progressMaybe ?? EMPTY_PROGRESS

  const query = useMemo<WordQuery>(
    () => filtersToQuery({ levels, upToMode, upToLevel, pos, status, topN, sort, search }),
    [levels, upToMode, upToLevel, pos, status, topN, sort, search],
  )

  const results = useMemo(() => queryWords(query, progress), [query, progress])

  return { query, results, progress, isLoadingProgress: progressMaybe === undefined }
}

const EMPTY_PROGRESS: Map<WordId, WordProgressRecord> = new Map()
