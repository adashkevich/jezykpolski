/**
 * `pos-classify` exercise — "Быстрая классификация части речи"
 * (`spec/tasks/27-context-and-error-analysis.md` §4, FR-57). The fixed 4-way option set
 * (`POS_VALUES`) is a content-layer constant, not stored on the exercise itself (see that
 * type's own doc comment in `exercise.types.ts`) — this component is the one place that
 * reads it to render the 4 buttons. Practice-only, rendered through the ordinary
 * `SessionRunner` registry, same as every other single-slot exercise type.
 */
import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { POS_VALUES, type PosValue } from '@/content/codec.ts'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type PosClassifyExerciseData = ExerciseOfType<'pos-classify'>

type OptionState = 'idle' | 'correct' | 'incorrect' | 'other'

const POS_LABELS: Readonly<Record<PosValue, string>> = {
  NOUN: 'Существительное',
  VERB: 'Глагол',
  ADJ: 'Прилагательное',
  ADV: 'Наречие',
}

export function PosClassifyExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<PosClassifyExerciseData>) {
  const [selected, setSelected] = useState<PosValue | null>(null)
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

  function pick(option: PosValue) {
    if (disabled || answered) return
    setSelected(option)
    onAnswer(option)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || answered) return
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= POS_VALUES.length) {
      event.preventDefault()
      pick(POS_VALUES[digit - 1]!)
    }
  }

  function stateOf(option: PosValue): OptionState {
    if (!answered) return 'idle'
    if (option === exercise.correct) return 'correct'
    if (option === selected) return 'incorrect'
    return 'other'
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Какая это часть речи?</p>
        <h2 className="text-2xl font-semibold text-foreground">{exercise.lemma}</h2>
      </div>

      <div
        role="radiogroup"
        aria-label="Варианты ответа"
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-2"
      >
        {POS_VALUES.map((option, index) => {
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
              <span className="flex-1">{POS_LABELS[option]}</span>
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
