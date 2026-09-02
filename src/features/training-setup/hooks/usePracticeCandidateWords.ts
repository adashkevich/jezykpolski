/**
 * The async half of `TrainingSetupScreen`'s live preview (`spec/tasks/19-practice-mode.md`
 * §3, `spec/app-design.md` §23's "Найдено 412 слов, 2 890 форм").
 *
 * Deliberately keyed only by the *content-affecting* fields of `PracticeConfig`
 * (`section`/`upToLevel`/`status`/`topN`) — not the whole config object — so toggling a
 * dimension checkbox, an exercise-type checkbox, or the task-count select never re-fetches a
 * single paradigm shard; only a level/status/frequency/section change does
 * (`session-scope.ts#resolvePracticeCandidateWords`'s own header explains why that split is
 * safe: the matching pass that actually consumes `dimensionSelection` lives entirely in
 * `build-practice-queue.ts`, purely client-side over whatever `candidateWords` this hook
 * already fetched).
 */
import { useEffect, useState } from 'react'
import type { LevelValue } from '@/content/codec.ts'
import type { PracticeCandidateWord, PracticeSection } from '@/learning/session/session.types.ts'
import type { WordStatus } from '@/types/progress.ts'
import { resolvePracticeCandidateWords } from '@/features/session-runner/lib/session-scope.ts'

export interface PracticeWordFilter {
  readonly section: PracticeSection
  readonly upToLevel: LevelValue | null
  readonly status: readonly WordStatus[]
  readonly topN: 500 | 1000 | 2000 | 5000 | null
}

function filterKey(filter: PracticeWordFilter): string {
  return JSON.stringify([
    filter.section,
    filter.upToLevel,
    [...filter.status].sort(),
    filter.topN,
  ])
}

export interface PracticeCandidateWordsResult {
  /** `null` while the very first fetch for the current filter is still in flight; the
   *  *previous* filter's result stays visible while a new one loads (avoids an empty-preview
   *  flash on every level/status/frequency tweak) — `loading` distinguishes the two cases. */
  readonly candidateWords: readonly PracticeCandidateWord[] | null
  readonly loading: boolean
}

export function usePracticeCandidateWords(filter: PracticeWordFilter): PracticeCandidateWordsResult {
  const key = filterKey(filter)
  const [resolved, setResolved] = useState<{
    key: string
    candidateWords: readonly PracticeCandidateWord[]
  } | null>(null)

  useEffect(() => {
    let alive = true
    resolvePracticeCandidateWords({
      section: filter.section,
      upToLevel: filter.upToLevel,
      status: filter.status,
      topN: filter.topN,
      // The remaining `PracticeConfig` fields are unused by `resolvePracticeCandidateWords`
      // (it only reads section/upToLevel/status/topN — see its own doc comment) — filled
      // with inert placeholders rather than widening that function's parameter type just for
      // this call site.
      includeTranslation: false,
      dimensionSelection: {},
      exerciseTypes: { choice: false, input: false },
      targetSize: 0,
    }).then((candidateWords) => {
      if (alive) setResolved({ key, candidateWords })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    candidateWords: resolved?.candidateWords ?? null,
    loading: resolved?.key !== key,
  }
}
