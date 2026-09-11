/**
 * The "Интервальное повторение" hero card — the one primary Learn action (FR-14). Shared by
 * `/` (`HomePage.tsx`, where it was born in task 15) and `/practice`
 * (`TrainingSetupScreen.tsx`, as that screen's first item), so both entry points offer the
 * same daily Learn session with the same label logic.
 *
 * The CTA always routes to `/session` with no router state — `useSessionBootstrap` (task 13)
 * already builds the global Learn queue (due reviews first, then new words) and renders its
 * own empty/resume states. Only the button's *label* changes with context:
 *  - No progress at all yet (`learningTotal + learnedTotal === 0` — a fresh install) →
 *    "Начать обучение" plus a one-line onboarding blurb, no due counter.
 *  - `countDue() === 0` but the learner has existing progress → "Учить новые слова", and the
 *    block explicitly says "нет повторений" rather than a bare zero (task 15, acceptance 7).
 *  - Otherwise → "Продолжить обучение" with the due count.
 *
 * All counters are `useLiveQuery`-based, so they refresh themselves after a session.
 */
import { useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { useDueCount } from '@/hooks/useDueCount.ts'
import { useLevelGate } from '@/hooks/useLevelGate.ts'
import { useWordProgressSummary } from '@/hooks/useWordProgressSummary.ts'
import { pluralize } from '@/lib/pluralize.ts'

export function LearnHero() {
  const navigate = useNavigate()
  const dueCount = useDueCount()
  const summary = useWordProgressSummary()
  const levelGate = useLevelGate()

  const loading = dueCount === undefined || summary === undefined
  const hasAnyProgress = (summary?.learningTotal ?? 0) + (summary?.learnedTotal ?? 0) > 0
  const due = dueCount ?? 0

  // Task 35 §4 / task 38: the level gate quietly changes which new words a session
  // introduces, so it must be visible — otherwise it reads as a bug ("почему больше не
  // появляются новые слова"). Shows the ONE level new words are currently coming from
  // (`currentLevel`), not the whole `unlocked` prefix. Hidden once `currentLevel` is
  // `undefined` (whole open range started) — that's the existing "нет новых слов" state.
  const levelGateLine =
    levelGate && levelGate.currentLevel
      ? `Сейчас изучаем: ${levelGate.currentLevel} · осталось ${levelGate.unstartedByLevel[levelGate.currentLevel]} ${pluralize(levelGate.unstartedByLevel[levelGate.currentLevel]!, ['слово', 'слова', 'слов'])}`
      : null

  const showDueCount = !loading && hasAnyProgress && due > 0

  let ctaLabel: string
  let reviewDescription: string | null
  if (loading) {
    ctaLabel = 'Продолжить обучение'
    reviewDescription = null
  } else if (!hasAnyProgress) {
    ctaLabel = 'Начать обучение'
    reviewDescription =
      'Добро пожаловать! Мы сами подберём первые слова и будем повторять их по расписанию.'
  } else if (due === 0) {
    ctaLabel = 'Учить новые слова'
    reviewDescription = 'Повторений на сегодня нет — можно выучить что-то новое.'
  } else {
    ctaLabel = 'Продолжить обучение'
    reviewDescription = `${pluralize(due, ['готово', 'готовы', 'готовы'])} к повторению прямо сейчас`
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-raised">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-label-md font-semibold tracking-[0.04em] text-primary-strong uppercase">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          Интервальное повторение
        </span>

        <div className="flex flex-col gap-1" aria-live="polite">
          {showDueCount && (
            <p className="flex items-baseline gap-2">
              <span className="tnum text-display-lg text-foreground">{due}</span>
              <span className="text-headline-md font-medium text-muted-foreground">
                {pluralize(due, ['слово', 'слова', 'слов'])}
              </span>
            </p>
          )}
          {reviewDescription && <p className="text-body-lg text-muted-foreground">{reviewDescription}</p>}
        </div>

        <Button
          type="button"
          size="lg"
          className="w-full shadow-cta"
          disabled={loading}
          onClick={() => navigate('/session')}
        >
          {ctaLabel}
          <Play aria-hidden="true" data-icon="inline-end" className="fill-current" />
        </Button>

        {levelGateLine && (
          <p className="text-center text-body-sm text-muted-foreground" aria-live="polite">
            {levelGateLine}
          </p>
        )}
      </div>
    </section>
  )
}
