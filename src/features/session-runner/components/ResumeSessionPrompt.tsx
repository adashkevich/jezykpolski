/**
 * "Continue or start over" (`spec/tasks/13-session-runner.md` §5: "предложить продолжить
 * или начать заново") — shown by `SessionPage` in place of the runner while
 * `useSessionBootstrap` is in its `'resume-prompt'` phase, i.e. before any queue exists yet.
 */
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'

export function ResumeSessionPrompt({
  answeredCount,
  onResume,
  onStartOver,
}: {
  answeredCount: number
  onResume: () => void
  onStartOver: () => void
}) {
  return (
    <EmptyState
      title="Есть незавершённая сессия"
      description={
        answeredCount > 0
          ? `Вы уже ответили на ${answeredCount} ${pluralizeItem(answeredCount)} — весь прогресс сохранён.`
          : 'Сессия была прервана до первого ответа.'
      }
      action={
        <div className="flex gap-2">
          <Button type="button" onClick={onResume} className="min-h-11">
            Продолжить
          </Button>
          <Button type="button" variant="outline" onClick={onStartOver} className="min-h-11">
            Начать заново
          </Button>
        </div>
      }
    />
  )
}

function pluralizeItem(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'задание'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'задания'
  return 'заданий'
}
