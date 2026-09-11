/**
 * The async half of the "Найдено N слов" preview and pool for the three POS-independent
 * lexical drills (`spec/tasks/36-practice-screen-restructure.md` §1, FR-147, narrowed further
 * by `spec/tasks/39-practice-current-level.md`, FR-147) — same shape and caching discipline as
 * `usePracticeCandidateWords.ts`, just resolving plain `WordId`s via
 * `resolveLexicalCandidateWordIds` instead of full `PracticeCandidateWord`s (these drills
 * never touch a paradigm shard, see that function's own header).
 *
 * Task 39 removed the last user-chosen input the old `LexicalWordFilter` carried — the pool
 * is entirely derived from the level gate (`words-progress.repository.ts`/`level-gate.ts`),
 * which only changes across a whole app session as `wordProgress` changes (a session
 * completes). So this hook fetches once on mount rather than re-keying on a filter object —
 * there is nothing left to vary within one `/practice` visit.
 */
import { useEffect, useState } from 'react'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { resolveLexicalCandidateWordIds } from '@/features/session-runner/lib/session-scope.ts'

export interface LexicalCandidateWordsResult {
  /** `null` while the fetch is still in flight. */
  readonly wordIds: readonly WordId[] | null
  readonly loading: boolean
}

export function useLexicalCandidateWords(): LexicalCandidateWordsResult {
  const [wordIds, setWordIds] = useState<readonly WordId[] | null>(null)

  useEffect(() => {
    let alive = true
    resolveLexicalCandidateWordIds().then((ids) => {
      if (alive) setWordIds(ids)
    })
    return () => {
      alive = false
    }
  }, [])

  return { wordIds, loading: wordIds === null }
}
