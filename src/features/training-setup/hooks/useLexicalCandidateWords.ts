/**
 * The async half of the "Выборка слов" preview for the three POS-independent lexical drills
 * (`spec/tasks/36-practice-screen-restructure.md` §1, FR-147) — same shape and caching
 * discipline as `usePracticeCandidateWords.ts`, just resolving plain `WordId`s via
 * `resolveLexicalCandidateWordIds` instead of full `PracticeCandidateWord`s (these drills
 * never touch a paradigm shard, see that function's own header).
 */
import { useEffect, useState } from 'react'
import type { WordId } from '@/learning/skills/skill-id.ts'
import {
  resolveLexicalCandidateWordIds,
  type LexicalWordFilter,
} from '@/features/session-runner/lib/session-scope.ts'

export type { LexicalWordFilter }

function filterKey(filter: LexicalWordFilter): string {
  return JSON.stringify([filter.upToLevel, [...filter.status].sort(), filter.topN])
}

export interface LexicalCandidateWordsResult {
  /** `null` while the very first fetch for the current filter is still in flight; the
   *  *previous* filter's result stays visible while a new one loads, same
   *  no-empty-preview-flash rationale as `usePracticeCandidateWords.ts`. */
  readonly wordIds: readonly WordId[] | null
  readonly loading: boolean
}

export function useLexicalCandidateWords(filter: LexicalWordFilter): LexicalCandidateWordsResult {
  const key = filterKey(filter)
  const [resolved, setResolved] = useState<{ key: string; wordIds: readonly WordId[] } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    resolveLexicalCandidateWordIds(filter).then((wordIds) => {
      if (alive) setResolved({ key, wordIds })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    wordIds: resolved?.wordIds ?? null,
    loading: resolved?.key !== key,
  }
}
