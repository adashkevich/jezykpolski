/**
 * `form-choice` exercise — NOUN case/number multiple choice (`spec/tasks/18-noun-exercises.md`
 * step 3, FR-70/FR-93). Sibling of `ChoiceExercise.tsx` (task 12): same interaction pattern
 * (digits 1-4 pick an option, first option auto-focused per question, `sr-only` labels
 * alongside the correct/incorrect icons per NFR-11) — the only real difference is the prompt,
 * built from `exercise.lemma`/`exercise.hint`/`exercise.promptMode` and `exercise.slot`
 * instead of a single `exercise.prompt` string, exactly as `FormInputExercise.tsx` (this
 * task's other new component) already does. See that file's header for why the
 * non-`promptMode` field of the two is only revealed once answered, and why the slot label
 * comes from `describeDimension`.
 *
 * Distractors (`exercise.options`) are already picked from the same paradigm and positioned
 * by `generate.ts#buildFormChoice` (task 09) + `distractors.ts#pickFormDistractors`
 * (task 10) — this component only renders them, same as `ChoiceExercise` never calls
 * `distractors.ts` itself.
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { describeDimension } from '@/learning/skills/dimensions.ts'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type FormChoiceExerciseData = ExerciseOfType<'form-choice'>

type OptionState = 'idle' | 'correct' | 'incorrect' | 'other'

export function FormChoiceExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<FormChoiceExerciseData>) {
  const [selected, setSelected] = useState<string | null>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const answered = feedback !== null

  const [lastExercise, setLastExercise] = useState(exercise)
  if (exercise !== lastExercise) {
    setLastExercise(exercise)
    setSelected(null)
  }

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

  const primaryPrompt = exercise.promptMode === 'lemma' ? exercise.lemma : exercise.hint
  const secondaryPrompt = exercise.promptMode === 'lemma' ? exercise.hint : exercise.lemma
  const secondaryLabel = exercise.promptMode === 'lemma' ? 'Перевод' : 'Лемма'
  const dimension = describeDimension(exercise.slot)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-foreground">{primaryPrompt}</h2>
        {answered && (
          <p className="text-sm text-muted-foreground">
            {secondaryLabel}: {secondaryPrompt}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-base font-medium text-foreground">{dimension.primary.pl}</p>
        {dimension.secondary && (
          <p className="text-base font-medium text-foreground">{dimension.secondary.pl}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {dimension.primary.ru}
          {dimension.secondary ? `, ${dimension.secondary.ru.toLowerCase()}` : ''}
        </p>
      </div>

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
