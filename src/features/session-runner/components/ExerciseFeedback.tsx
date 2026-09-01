/**
 * Unified post-answer feedback banner (`spec/tasks/12-vocabulary-exercises.md` §6):
 * верно / почти / неверно + правильный ответ + кнопка «Далее».
 *
 * Deliberately NOT part of `ExerciseProps<E>` (`./exercise-props.types.ts`) — the shared
 * exercise contract only carries `onAnswer`, not an "advance to next question" callback, so
 * this component is a sibling the future session runner (task 13) renders alongside whichever
 * `ChoiceExercise`/`InputExercise`/`SelfAssessExercise` is active, once it has a `GradeResult`
 * in hand. One component, reused across every exercise type, rather than each exercise
 * component growing its own copy of the same banner.
 *
 * NFR-11 ("не полагаться только на цвет"): correct/near-miss/incorrect each pair a distinct
 * icon shape with a distinct color AND a distinct text label — see `STATUS_META` below.
 *
 * `prefers-reduced-motion`: the entrance animation classes are gated behind Tailwind's
 * `motion-safe:` variant (compiles to `@media (prefers-reduced-motion: no-preference)`), so a
 * user with reduced motion enabled gets a plain, unanimated banner — never an unconditional
 * `animate-*` class.
 */
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { GradeResult } from '@/learning/exercises/grade.ts'
import { renderDiffHighlight } from '../lib/diff-highlight.tsx'

export interface ExerciseFeedbackProps {
  readonly feedback: GradeResult
  /** The canonical correct answer to show — the exercise component knows which string this
   *  is (`exercise.correct` / `exercise.accepted[0]` / `exercise.answer`), this component
   *  only renders it. */
  readonly correctAnswer: string
  /** "Далее" was activated (click, or Enter on the auto-focused button). */
  onNext(): void
}

type FeedbackStatus = 'correct' | 'nearMiss' | 'incorrect'

interface StatusMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly textClassName: string
  readonly panelClassName: string
}

const STATUS_META: Readonly<Record<FeedbackStatus, StatusMeta>> = {
  correct: {
    label: 'Верно!',
    icon: CheckCircle2,
    textClassName: 'text-success',
    panelClassName: 'border-success/40 bg-success/10',
  },
  nearMiss: {
    label: 'Почти! Проверь диакритики',
    icon: AlertTriangle,
    textClassName: 'text-warning',
    panelClassName: 'border-warning/40 bg-warning/10',
  },
  incorrect: {
    label: 'Неверно',
    icon: XCircle,
    textClassName: 'text-error',
    panelClassName: 'border-error/40 bg-error/10',
  },
}

function statusOf(feedback: GradeResult): FeedbackStatus {
  if (feedback.correct) return 'correct'
  if (feedback.nearMiss) return 'nearMiss'
  return 'incorrect'
}

export function ExerciseFeedback({ feedback, correctAnswer, onNext }: ExerciseFeedbackProps) {
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const status = statusOf(feedback)
  const meta = STATUS_META[status]
  const Icon = meta.icon

  // Autofocus "Далее" whenever a new feedback appears, so Enter (native button activation)
  // advances the session without the user reaching for the mouse (task step 7).
  useEffect(() => {
    nextButtonRef.current?.focus()
  }, [feedback])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
        meta.panelClassName,
      )}
    >
      <div className={cn('flex items-center gap-2 text-base font-semibold', meta.textClassName)}>
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>{meta.label}</span>
      </div>

      {status !== 'correct' && (
        <p className="text-sm text-foreground">
          Правильный ответ:{' '}
          <strong className="font-semibold">
            {status === 'nearMiss' && feedback.diff
              ? renderDiffHighlight(feedback.diff.expected, feedback.diff.diacriticIndexes)
              : correctAnswer}
          </strong>
        </p>
      )}

      <button
        ref={nextButtonRef}
        type="button"
        onClick={onNext}
        className="min-h-11 self-end rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
      >
        Далее
      </button>
    </div>
  )
}
