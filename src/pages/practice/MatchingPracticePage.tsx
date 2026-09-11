/**
 * `/practice/matching` — "Сопоставление" (`spec/tasks/27-context-and-error-analysis.md`
 * §4, FR-55). No `:wordId` param — this is a batch of 5 words, sent via router state from
 * `TrainingSetupScreen`'s own "Сопоставление" section (same spirit as
 * `TablePracticePage.tsx`'s `:wordId` param, just router-state instead of a URL param since
 * a batch of ids doesn't fit cleanly into one).
 *
 * Task 36 (`spec/tasks/36-practice-screen-restructure.md` §4, FR-149) — this drill has no
 * separate results page (unlike the two `/session`-routed lexical drills), so "Ещё"/"К списку
 * практик" (`PracticeDrillActions`) render right here once `MatchingExercise` reports
 * `onDone`, instead of immediately navigating away. "Ещё" resamples a fresh batch (task 39,
 * `spec/tasks/39-practice-current-level.md`: from the level gate's own pool, no filter to
 * carry any more) and remounts `MatchingPracticeContent` under a new `key` (its own hook
 * captures `wordIds` once on mount, same convention as every other session-scoped hook in
 * this feature).
 */
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { resolveLexicalCandidateWordIds } from '@/features/session-runner/lib/session-scope.ts'
import { MATCHING_PAIR_COUNT, sampleWordBatch } from '@/learning/practice/lexical-batch.ts'
import { useMatchingPracticeSession } from '@/features/session-runner/hooks/useMatchingPracticeSession.ts'
import { MatchingExercise } from '@/features/session-runner/components/MatchingExercise.tsx'
import { PracticeDrillActions } from '@/features/session-runner/components/PracticeDrillActions.tsx'

interface MatchingBatch {
  readonly wordIds: readonly WordId[]
}

function MatchingPracticeContent({
  wordIds,
  onAgain,
  againDisabled,
}: {
  wordIds: readonly WordId[]
  onAgain: () => void
  againDisabled: boolean
}) {
  const navigate = useNavigate()
  const { status, gradePair, finish } = useMatchingPracticeSession(wordIds)
  const [done, setDone] = useState(false)

  async function handleDone() {
    await finish()
    setDone(true)
  }

  return (
    <PageContainer>
      <PageHeader
        title="Сопоставление"
        description="Соедините польские слова с их переводами — каждая пара проверяется сразу."
      />

      {status.phase === 'loading' && (
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-muted-foreground">
          Готовим слова…
        </p>
      )}

      {status.phase === 'error' && (
        <EmptyState
          title="Не удалось запустить тренировку"
          description={status.message}
          action={
            <Button type="button" onClick={() => navigate('/practice')} className="min-h-11">
              Назад
            </Button>
          }
        />
      )}

      {status.phase === 'ready' && !done && (
        <MatchingExercise
          pairs={status.pairs}
          onPairMatched={(wordId) => gradePair(wordId)}
          onDone={() => void handleDone()}
        />
      )}

      {done && (
        <PracticeDrillActions
          onAgain={onAgain}
          againDisabled={againDisabled}
          onBackToList={() => navigate('/practice')}
        />
      )}
    </PageContainer>
  )
}

export function MatchingPracticePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as MatchingBatch | null
  const [resampling, setResampling] = useState(false)
  const batchKey = state?.wordIds.join('|') ?? ''

  // "Adjust state during render" (same pattern `LetterSlotsInput.tsx`'s own `lastAccepted`
  // uses) — "Ещё" `navigate(..., { replace: true })` lands back on this same route/component
  // (no remount) with a new `state.wordIds`; once that new batch has actually arrived, the
  // button's disabled flag must clear, rather than staying stuck disabled forever. Not an
  // effect: `react-hooks/set-state-in-effect` forbids `setState` in effects in this codebase.
  const [lastBatchKey, setLastBatchKey] = useState(batchKey)
  if (batchKey !== lastBatchKey) {
    setLastBatchKey(batchKey)
    setResampling(false)
  }

  if (!state || state.wordIds.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Сопоставление"
          description="Слова для тренировки не переданы — начните из экрана «Практика»."
        />
      </PageContainer>
    )
  }

  async function handleAgain() {
    if (!state) return
    setResampling(true)
    const ids = await resolveLexicalCandidateWordIds()
    const wordIds = sampleWordBatch(ids, MATCHING_PAIR_COUNT, Date.now())
    navigate('/practice/matching', { replace: true, state: { wordIds } })
  }

  return (
    <MatchingPracticeContent
      key={state.wordIds.join('|')}
      wordIds={state.wordIds}
      onAgain={() => void handleAgain()}
      againDisabled={resampling}
    />
  )
}

export default MatchingPracticePage
