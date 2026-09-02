/**
 * `/practice/matching` — "Сопоставление" (`spec/tasks/27-context-and-error-analysis.md`
 * §4, FR-55). No `:wordId` param — this is a batch of 5 words, sent via router state from
 * `TrainingSetupScreen`'s own "Сопоставление" section (same spirit as
 * `TablePracticePage.tsx`'s `:wordId` param, just router-state instead of a URL param since
 * a batch of ids doesn't fit cleanly into one).
 */
import { useLocation, useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { useMatchingPracticeSession } from '@/features/session-runner/hooks/useMatchingPracticeSession.ts'
import { MatchingExercise } from '@/features/session-runner/components/MatchingExercise.tsx'

function MatchingPracticeContent({ wordIds }: { wordIds: readonly WordId[] }) {
  const navigate = useNavigate()
  const { status, gradePair, finish } = useMatchingPracticeSession(wordIds)

  async function handleDone() {
    await finish()
    navigate('/practice')
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

      {status.phase === 'ready' && (
        <MatchingExercise
          pairs={status.pairs}
          onPairMatched={(wordId) => gradePair(wordId)}
          onDone={() => void handleDone()}
        />
      )}
    </PageContainer>
  )
}

export function MatchingPracticePage() {
  const location = useLocation()
  const state = location.state as { wordIds?: WordId[] } | null
  const wordIds = state?.wordIds ?? []

  if (wordIds.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Сопоставление"
          description="Слова для тренировки не переданы — начните из экрана «Практика»."
        />
      </PageContainer>
    )
  }

  return <MatchingPracticeContent wordIds={wordIds} />
}

export default MatchingPracticePage
