/**
 * `/session` — the real Learn runner (`spec/tasks/13-session-runner.md`), replacing the
 * task-06 stub. Reads `location.state` for the two scopes `LearnFab.tsx` (task 07, `{
 * filter }`) and `WordActions.tsx` (task 08, `{ wordId }`) already navigate here with — see
 * `features/session-runner/lib/session-scope.ts#parseSessionScope` for how each maps to a
 * candidate pool. No state at all (a plain `/session` visit, or the future `HomePage`'s
 * "Продолжить обучение", task 15) falls back to the global default queue — acceptance
 * point 1's "запускает сессию без дополнительных экранов": this page never shows a setup
 * screen, it goes straight from "loading" to either the runner, a resume prompt (task text
 * §5), or an `EmptyState`.
 *
 * `useSessionBootstrap` owns every async step (resume check, candidate resolution, queue
 * build, eager exercise generation); this component only maps its `status` to UI.
 */
import { useNavigate, useLocation } from 'react-router'
import { useMemo } from 'react'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useSessionBootstrap } from '@/features/session-runner/hooks/useSessionBootstrap.ts'
import { parseSessionScope } from '@/features/session-runner/lib/session-scope.ts'
import { ResumeSessionPrompt } from '@/features/session-runner/components/ResumeSessionPrompt.tsx'
import { SessionRunner } from '@/features/session-runner/components/SessionRunner.tsx'

export function SessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const scope = useMemo(() => parseSessionScope(location.state), [location.state])
  const { status, resumeIncomplete, abandonAndStartFresh, retry } = useSessionBootstrap(scope)

  function goToResults() {
    navigate('/session/result', { replace: true })
  }

  return (
    <PageContainer>
      <PageHeader title="Сессия" description="Учим и повторяем — очередь собирает алгоритм." />

      {status.phase === 'loading' && (
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-muted-foreground">
          Собираем очередь…
        </p>
      )}

      {status.phase === 'resume-prompt' && (
        <ResumeSessionPrompt
          answeredCount={status.answeredCount}
          onResume={() => {
            void resumeIncomplete(status.incompleteSessionId)
          }}
          onStartOver={() => {
            void abandonAndStartFresh(status.incompleteSessionId)
          }}
        />
      )}

      {status.phase === 'empty' && (
        <EmptyState
          title="Нечего изучать прямо сейчас"
          description="Нет просроченных повторений, а новые слова либо закончились, либо дневной лимит равен нулю. Загляните позже или измените фильтры на «Словах»."
          action={
            <Button type="button" onClick={() => navigate('/words')} className="min-h-11">
              К списку слов
            </Button>
          }
        />
      )}

      {status.phase === 'error' && (
        <EmptyState
          title="Не удалось запустить сессию"
          description={status.message}
          action={
            <Button type="button" onClick={() => void retry()} className="min-h-11">
              Попробовать снова
            </Button>
          }
        />
      )}

      {status.phase === 'ready' && <SessionRunner runtime={status.runtime} onFinished={goToResults} />}
    </PageContainer>
  )
}

export default SessionPage
