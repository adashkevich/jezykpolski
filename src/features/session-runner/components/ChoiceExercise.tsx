/**
 * `choice` exercise — PL→RU / RU→PL multiple choice (`spec/tasks/12-vocabulary-exercises.md`
 * §3, FR-50/FR-51, `spec/app-design.md` §6 items 1–2).
 *
 * This component only collects the pick and calls `onAnswer` with the option's own text — it
 * never calls `grade()` and never imports `@/db/**` (task rule 2). Highlighting which option
 * was correct/incorrect once answered is driven entirely by the `feedback`/`disabled` props
 * the (future) session runner hands back, plus local `selected` state to remember *which*
 * option the user actually clicked (an option's own text isn't enough to derive that from
 * `feedback` alone — `GradeResult` doesn't carry it).
 *
 * NFR-11: the correct option and any wrong pick the user made are marked with a distinct icon
 * (`CheckCircle2`/`XCircle`) AND an `sr-only` text label, not color alone.
 *
 * Keyboard (task step 3/7): digits 1–4 pick the corresponding option; the first option
 * receives focus automatically whenever `exercise` changes (new question) so a keyboard-only
 * session never gets stuck without a focused control.
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type ChoiceExerciseData = ExerciseOfType<'choice'>

type OptionState = 'idle' | 'correct' | 'incorrect' | 'other'

export function ChoiceExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<ChoiceExerciseData>) {
  const [selected, setSelected] = useState<string | null>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const answered = feedback !== null

  // "Adjusting state when a prop changes" during render, same pattern as
  // `words-list/components/SearchInput.tsx` — not a `useEffect` (React's own guidance: a
  // same-render `setState` here is a synchronous reset, not a synchronization with anything
  // external, and `react-hooks/set-state-in-effect` flags the effect-body version of this).
  const [lastExercise, setLastExercise] = useState(exercise)
  if (exercise !== lastExercise) {
    setLastExercise(exercise)
    setSelected(null)
  }

  // Refocusing the first option IS a real external-system side effect (imperative DOM focus),
  // so it stays in an effect — just without the setState this rule actually objects to.
  useEffect(() => {
    firstOptionRef.current?.focus()
  }, [exercise])

  function pick(option: string) {
    if (disabled || answered) return
    setSelected(option)
    onAnswer(option)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || answered) return
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= exercise.options.length) {
      event.preventDefault()
      pick(exercise.options[digit - 1]!)
    }
  }

  function stateOf(option: string): OptionState {
    if (!answered) return 'idle'
    if (option === exercise.correct) return 'correct'
    if (option === selected) return 'incorrect'
    return 'other'
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-foreground">{exercise.prompt}</h2>
      <div
        role="radiogroup"
        aria-label="Варианты ответа"
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-2"
      >
        {exercise.options.map((option, index) => {
          const state = stateOf(option)
          return (
            <button
              key={option}
              ref={index === 0 ? firstOptionRef : undefined}
              type="button"
              role="radio"
              aria-checked={option === selected}
              disabled={disabled || answered}
              onClick={() => pick(option)}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg border px-4 py-2 text-left text-base outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none disabled:cursor-not-allowed',
                state === 'idle' && 'border-border bg-background hover:bg-muted',
                state === 'correct' && 'border-success bg-success/10 text-success',
                state === 'incorrect' && 'border-error bg-error/10 text-error',
                state === 'other' && 'border-border bg-background text-muted-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current/40 text-xs font-medium"
              >
                {index + 1}
              </span>
              <span className="flex-1">{option}</span>
              {state === 'correct' && (
                <>
                  <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
                  <span className="sr-only">Правильный ответ</span>
                </>
              )}
              {state === 'incorrect' && (
                <>
                  <XCircle aria-hidden="true" className="size-5 shrink-0" />
                  <span className="sr-only">Неверно</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
