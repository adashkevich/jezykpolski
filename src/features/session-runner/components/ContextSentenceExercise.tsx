/**
 * `context-sentence` exercise — "выбери форму, которая нужна в этом предложении"
 * (`spec/tasks/27-context-and-error-analysis.md` §2, FR-63). Sibling of `FormChoiceExercise`
 * (task 18): same interaction pattern (digits 1-4 pick an option, first option auto-focused
 * per question, `sr-only` labels alongside the correct/incorrect icons per NFR-11) — the
 * only real difference is the prompt: a fixed template sentence with the target word's slot
 * shown as a blank, instead of a bare lemma + dimension label. The task text explicitly
 * allows a plain choice list under the sentence rather than an inline dropdown ("UI сам
 * решает, как отрисовать") — this renders the blank as a visually distinct placeholder
 * inline in the sentence text, then the options below it, same shape as every other choice
 * exercise in this app.
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type ContextSentenceExerciseData = ExerciseOfType<'context-sentence'>

type OptionState = 'idle' | 'correct' | 'incorrect' | 'other'

/** Splits `"Nie ma ___."` into `["Nie ma ", "."]` around the literal blank marker so the UI
 *  can render the blank as its own styled placeholder rather than 3 bare underscores. */
function splitAroundBlank(sentence: string): [string, string] {
  const index = sentence.indexOf('___')
  if (index === -1) return [sentence, '']
  return [sentence.slice(0, index), sentence.slice(index + 3)]
}

export function ContextSentenceExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<ContextSentenceExerciseData>) {
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

  const [before, after] = splitAroundBlank(exercise.sentence)
  const blankText = answered ? exercise.correct : (selected ?? '…')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl leading-relaxed font-semibold text-foreground">
        {before}
        <span
          className={cn(
            'mx-1 inline-block min-w-16 rounded-md border-b-2 px-1 text-center',
            answered
              ? feedback?.correct
                ? 'border-success text-success'
                : 'border-error text-error'
              : 'border-muted-foreground text-muted-foreground',
          )}
        >
          {blankText}
        </span>
        {after}
      </p>

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
