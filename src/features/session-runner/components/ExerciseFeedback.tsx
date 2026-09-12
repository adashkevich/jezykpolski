/**
 * Unified post-answer feedback banner (`spec/tasks/12-vocabulary-exercises.md` §6):
 * верно / с подсказкой / почти / неверно + правильный ответ + кнопка «Далее».
 *
 * Deliberately NOT part of `ExerciseProps<E>` (`./exercise-props.types.ts`) — the shared
 * exercise contract only carries `onAnswer`, not an "advance to next question" callback, so
 * this component is a sibling the future session runner (task 13) renders alongside whichever
 * `ChoiceExercise`/`InputExercise`/`SelfAssessExercise` is active, once it has a `GradeResult`
 * in hand. One component, reused across every exercise type, rather than each exercise
 * component growing its own copy of the same banner.
 *
 * NFR-11 ("не полагаться только на цвет"): correct/assisted/near-miss/incorrect each pair a
 * distinct icon shape with a distinct color AND a distinct text label — see `STATUS_META`
 * below.
 *
 * Task 29 (`spec/tasks/29-letter-by-letter-input.md` §4): the per-character "Ты
 * написал / Правильно" comparison this panel used to render for `input`/`form-input`
 * (task 28, FR-58) is gone — that proof is now the letter slots themselves, live, while
 * typing. What replaces it is the `assisted` status: a clean-but-not-perfect attempt
 * (mistake and/or hint, `LetterSlotsInput`'s `TypedAttemptOutcome`) still shows "Верно!" in
 * `feedback.correct`, but the rating was capped at `Hard` (`policy.ts#mapResultToRating`),
 * so the panel says so explicitly rather than looking identical to a flawless answer. A
 * revealed word ("глазок", FR-85) shows the plain "Правильный ответ" line — the slots above
 * already spelled the whole word out, so a diff here would be pure noise.
 */
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Lightbulb,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import type { GradeResult } from '@/learning/exercises/grade.ts'
import type { TypedAttemptOutcome } from '@/learning/exercises/letter-attempt.ts'

export interface ExerciseFeedbackProps {
  readonly feedback: GradeResult
  /** The canonical correct answer to show — the exercise component knows which string this
   *  is (`exercise.correct` / `exercise.accepted[0]` / `exercise.answer`), this component
   *  only renders it. */
  readonly correctAnswer: string
  /** The letter-by-letter attempt's outcome (task 29), only set for `input`/`form-input`.
   *  Drives the `assisted` status below — a `choice`-family answer has nothing of the sort
   *  and leaves this `undefined`. */
  readonly attempt?: TypedAttemptOutcome
  /** "Далее" was activated (click, or Enter on the auto-focused button). */
  onNext(): void
  /** When set, a secondary "Знаю" button is shown above "Далее" — the runner passes it only
   *  after a correct answer on a `vocab:pl-ru` / `vocab:ru-pl-choice` question. */
  onMarkKnown?(): void
}

type FeedbackStatus = 'correct' | 'assisted' | 'nearMiss' | 'incorrect'

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
    panelClassName: 'border-success/30 bg-success-soft/60',
  },
  assisted: {
    label: 'Верно, но с подсказкой',
    icon: Lightbulb,
    textClassName: 'text-warning',
    panelClassName: 'border-warning/40 bg-warning/10',
  },
  nearMiss: {
    // `input`/`form-input` больше не могут дать near-miss (задача 29 — ответ либо точно
    // совпадает, либо это раскрытый «глазком» префикс), но панель общая для всех типов
    // упражнений, и таблицы склонения/спряжения (`TableExercise`, `VerbTableExercise`) по
    // прежнему принимают свободный текст и near-miss'ят — ветка остаётся ради них.
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

function statusOf(feedback: GradeResult, attempt: TypedAttemptOutcome | undefined): FeedbackStatus {
  if (feedback.correct) {
    const assisted = attempt !== undefined && (attempt.mistakes > 0 || attempt.hintsUsed > 0)
    return assisted ? 'assisted' : 'correct'
  }
  if (feedback.nearMiss) return 'nearMiss'
  return 'incorrect'
}

export function ExerciseFeedback({
  feedback,
  correctAnswer,
  attempt,
  onNext,
  onMarkKnown,
}: ExerciseFeedbackProps) {
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const status = statusOf(feedback, attempt)
  const meta = STATUS_META[status]
  const Icon = meta.icon

  // Autofocus "Далее" whenever a new feedback appears, so Enter (native button activation)
  // advances the session without the user reaching for the mouse (task step 7).
  useEffect(() => {
    nextButtonRef.current?.focus()
  }, [feedback])

  // `mt-auto`: `SessionRunner` is a full-height flex column, so the actions sit at the bottom
  // of the screen, above the tab bar (spec/design/task-choose.png, task-input.png).
  return (
    <div className="mt-auto flex flex-col gap-3">
      {status === 'correct' ? (
        // A plain correct answer is already shown in green by the exercise itself (the picked
        // option / the letter slots) — a second green "Верно!" panel on top of that was
        // redundant, so it's only announced to screen readers.
        <p role="status" aria-live="polite" className="sr-only">
          {meta.label}
        </p>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex flex-col gap-3 rounded-2xl border p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
            meta.panelClassName,
          )}
        >
          <div className={cn('flex items-center gap-2 text-headline-sm', meta.textClassName)}>
            <Icon aria-hidden="true" className="size-6 shrink-0" />
            <span>{meta.label}</span>
          </div>

          {status === 'assisted' && (
            <p className="text-body-md text-foreground">Слово вернётся на повторение.</p>
          )}

          {(status === 'nearMiss' || status === 'incorrect') && (
            <p className="text-body-md text-foreground">
              Правильный ответ: <strong className="font-semibold">{correctAnswer}</strong>
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {onMarkKnown && (
          // DESIGN.md "Secondary Action": subtle wash + hairline border, 52px, same weight
          // as "Далее" so the two read as a pair.
          <Button
            type="button"
            variant="outline"
            onClick={onMarkKnown}
            className="h-13 flex-1 gap-2 border-border bg-muted text-body-lg font-semibold hover:bg-surface-container"
          >
            <Check aria-hidden="true" className="size-5" />
            Знаю
          </Button>
        )}

        {/* DESIGN.md primary action: 52px, carmine. */}
        <button
          ref={nextButtonRef}
          type="button"
          onClick={onNext}
          className="min-h-13 flex-1 rounded-xl bg-primary px-5 text-body-lg font-semibold text-primary-foreground outline-none transition-all hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.98] motion-reduce:transition-none"
        >
          Далее
        </button>
      </div>
    </div>
  )
}
