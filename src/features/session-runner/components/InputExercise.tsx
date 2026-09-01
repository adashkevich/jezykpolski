/**
 * `input` exercise — PL→RU / RU→PL free-text recall (`spec/tasks/12-vocabulary-exercises.md`
 * §4, FR-52/FR-53, `spec/app-design.md` §6 items 3–4).
 *
 * Only collects text and calls `onAnswer` — never calls `grade()`, never imports `@/db/**`
 * (task rule 2). `feedback` (a `GradeResult` the runner already computed) drives the
 * correct/near-miss/incorrect display; this component never re-derives it.
 *
 * `autoCapitalize="off"` / `autoCorrect="off"` / `spellCheck={false}` (task step 4, task rule
 * 5): without these a mobile keyboard "corrects" Polish spelling (diacritics, `sz`/`cz`
 * digraphs) into nonsense before the user can even submit it.
 *
 * `nearMiss` (task step 4 / `@/learning/exercises/grade.ts`'s `GradeResult.nearMiss`): shown
 * as its own state — a warning icon + "Почти верно", never lumped in with "Неверно" — with the
 * differing (missing-diacritic) characters highlighted via `../lib/diff-highlight.tsx`, reusing
 * exactly the `DiffHint` `grade()` already computed.
 *
 * Polish input direction (`ru-pl`, i.e. the user types Polish) gets a row of quick-insert
 * buttons for `ą ć ę ł ń ó ś ź ż` — task step 4's "мобильная клавиатура может их не давать без
 * переключения раскладки". Each button is a full 44px touch target (NFR-11) and inserts at
 * the current caret position rather than always appending, so the field stays usable mid-word.
 */
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { renderDiffHighlight } from '../lib/diff-highlight.tsx'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type InputExerciseData = ExerciseOfType<'input'>

const POLISH_SPECIAL_CHARS = ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'] as const

interface InputStateMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly textClassName: string
  readonly borderClassName: string
  readonly diffNode?: ReactNode
}

export function InputExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<InputExerciseData>) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const answered = feedback !== null
  // `grade.ts#answerLanguage`: pl-ru shows a Polish prompt and expects a Russian answer, and
  // vice versa — the diacritics helper only makes sense when the expected answer is Polish.
  const inputLanguage: 'pl' | 'ru' = exercise.direction === 'pl-ru' ? 'ru' : 'pl'

  // "Adjusting state when a prop changes" during render (same pattern as
  // `ChoiceExercise.tsx` / `words-list/components/SearchInput.tsx`) — resetting typed text for
  // a new question isn't a `useEffect` concern, only refocusing the field is.
  const [lastExercise, setLastExercise] = useState(exercise)
  if (exercise !== lastExercise) {
    setLastExercise(exercise)
    setValue('')
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [exercise])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (disabled || answered || value.trim().length === 0) return
    onAnswer(value)
  }

  function insertChar(char: string) {
    const el = inputRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + char + value.slice(end)
    setValue(next)
    const caret = start + char.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  // `feedback === null` (not the `answered` bool above) so TS narrows `feedback` itself
  // inside each branch below — `.correct`/`.nearMiss`/`.diff` all read off the narrowed type.
  const stateMeta: InputStateMeta | null =
    feedback === null
      ? null
      : feedback.correct
        ? {
            label: 'Верно',
            icon: CheckCircle2,
            textClassName: 'text-success',
            borderClassName: 'border-success',
          }
        : feedback.nearMiss
          ? {
              label: 'Почти верно',
              icon: AlertTriangle,
              textClassName: 'text-warning',
              borderClassName: 'border-warning',
              diffNode: feedback.diff
                ? renderDiffHighlight(feedback.diff.expected, feedback.diff.diacriticIndexes)
                : undefined,
            }
          : {
              label: 'Неверно',
              icon: XCircle,
              textClassName: 'text-error',
              borderClassName: 'border-error',
            }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold text-foreground">{exercise.prompt}</h2>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label={inputLanguage === 'pl' ? 'Ответ по-польски' : 'Ответ по-русски'}
            value={value}
            disabled={disabled || answered}
            onChange={(event) => setValue(event.target.value)}
            className={cn(
              'h-11 w-full rounded-lg border bg-background px-4 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
              stateMeta ? 'pr-11' : 'pr-4',
              stateMeta ? stateMeta.borderClassName : 'border-border',
            )}
          />
          {stateMeta && (
            <stateMeta.icon
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2',
                stateMeta.textClassName,
              )}
            />
          )}
        </div>

        {stateMeta && (
          <p className={cn('flex items-center gap-1 text-sm font-medium', stateMeta.textClassName)}>
            {stateMeta.label}
            {stateMeta.diffNode && <span className="text-foreground">— {stateMeta.diffNode}</span>}
          </p>
        )}

        {inputLanguage === 'pl' && !answered && (
          <div
            role="group"
            aria-label="Быстрый ввод польских диакритических знаков"
            className="flex flex-wrap gap-1"
          >
            {POLISH_SPECIAL_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                aria-label={`Вставить «${char}»`}
                disabled={disabled}
                onClick={() => insertChar(char)}
                className="flex size-11 items-center justify-center rounded-md border border-border text-base text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              >
                {char}
              </button>
            ))}
          </div>
        )}

        {!answered && (
          <button
            type="submit"
            disabled={disabled || value.trim().length === 0}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            Проверить
          </button>
        )}
      </form>
    </div>
  )
}
