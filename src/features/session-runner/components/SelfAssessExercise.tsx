/**
 * `self-assess` exercise — Anki-style self rating (`spec/tasks/12-vocabulary-exercises.md` §5,
 * FR-54, `spec/app-design.md` §6 item 8): show the prompt → "Показать ответ" → the answer plus
 * three rating buttons `Не знаю / Трудно / Знаю`.
 *
 * Deviation from the shared `ExerciseProps<E>` contract (documented here since it's this
 * task's own call, not spec-mandated): rating buttons must show the predicted next interval
 * (task step 5, "показать предполагаемые интервалы"), and that number only exists via
 * `previewIntervals(state, now)` (`@/learning/srs/fsrs-adapter.ts`, task 11) — a pure function
 * of the skill's *current* `SrsState`, which `ExerciseProps<E>` has no field for (it's
 * session/skill state, not part of the `Exercise` union). So this component's props are
 * `ExerciseProps<SelfAssessExerciseData> & { srsState: SrsState; now: number }` — the two
 * extra fields the future session runner (task 13) already has in hand (it needs the same
 * `SrsState` to call `review()` once a rating is picked). `now` is required, not defaulted to
 * `Date.now()` inside this component — same determinism convention `fsrs-adapter.ts` itself
 * follows (every one of its exported functions takes `now` as a parameter and never reads the
 * clock internally): a component reading `Date.now()` during render is also an
 * `eslint-plugin-react-hooks` purity violation (`react-hooks/purity`), since it makes the
 * render function's output depend on something other than its props/state.
 *
 * `onAnswer` is called with `'1' | '2' | '3'` — the app's own `Rating` scale (`Again` / `Hard`
 * / `Good`, `@/types/progress.ts`), serialized to a string per the shared contract. `Easy`
 * (`4`) has no button here: `spec/app-design.md`'s self-assess mockup and FR-54 both show
 * exactly three buttons, not four — this component doesn't invent a fourth. This component
 * never calls `grade()` (a self-assess rating isn't "graded" against a string answer at all)
 * and never imports `@/db/**`.
 */
import { useEffect, useRef, useState } from 'react'
import { previewIntervals } from '@/learning/srs/fsrs-adapter.ts'
import type { SrsState } from '@/learning/srs/srs.types.ts'
import { formatInterval } from '../lib/format-interval.ts'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type SelfAssessExerciseData = ExerciseOfType<'self-assess'>

export interface SelfAssessExerciseProps extends ExerciseProps<SelfAssessExerciseData> {
  /** Current FSRS state of the skill under review — needed only to compute the interval
   *  preview on each rating button. */
  readonly srsState: SrsState
  /** epoch ms — the clock reading the runner already made for this session/answer. */
  readonly now: number
}

const SELF_ASSESS_RATINGS: ReadonlyArray<{ rating: 1 | 2 | 3; label: string }> = [
  { rating: 1, label: 'Не знаю' },
  { rating: 2, label: 'Трудно' },
  { rating: 3, label: 'Знаю' },
]

export function SelfAssessExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
  srsState,
  now,
}: SelfAssessExerciseProps) {
  const [revealed, setRevealed] = useState(false)
  const showAnswerRef = useRef<HTMLButtonElement>(null)
  const firstRatingRef = useRef<HTMLButtonElement>(null)
  const answered = feedback !== null

  // "Adjusting state when a prop changes" during render (same pattern as `ChoiceExercise.tsx`
  // / `InputExercise.tsx`) — going back to the "prompt only" phase for a new question isn't a
  // `useEffect` concern, only refocusing "Показать ответ" is.
  const [lastExercise, setLastExercise] = useState(exercise)
  if (exercise !== lastExercise) {
    setLastExercise(exercise)
    setRevealed(false)
  }

  useEffect(() => {
    showAnswerRef.current?.focus()
  }, [exercise])

  // Revealing the answer moves focus to the first rating button so a keyboard-only session
  // never needs the mouse to rate (task step 7).
  useEffect(() => {
    if (revealed) firstRatingRef.current?.focus()
  }, [revealed])

  const intervals = previewIntervals(srsState, now)
  const showRatings = revealed || answered

  function reveal() {
    if (disabled) return
    setRevealed(true)
  }

  function rate(rating: 1 | 2 | 3) {
    if (disabled || answered) return
    onAnswer(String(rating))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-foreground">{exercise.prompt}</h2>

      {!showRatings ? (
        <button
          ref={showAnswerRef}
          type="button"
          disabled={disabled}
          onClick={reveal}
          className="min-h-11 self-start rounded-lg border border-border bg-background px-4 text-base font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
        >
          Показать ответ
        </button>
      ) : (
        <>
          <p className="text-xl font-medium text-foreground">{exercise.answer}</p>
          <div
            role="group"
            aria-label="Оцени, насколько хорошо ты знал(а) ответ"
            className="flex flex-col gap-2 sm:flex-row"
          >
            {SELF_ASSESS_RATINGS.map(({ rating, label }, index) => (
              <button
                key={rating}
                ref={index === 0 ? firstRatingRef : undefined}
                type="button"
                disabled={disabled || answered}
                onClick={() => rate(rating)}
                className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
              >
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">
                  через {formatInterval(intervals[rating])}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
