/**
 * `form-input` exercise — NOUN case/number free-text recall (`spec/tasks/18-noun-exercises.md`
 * steps 1/2/5/6, FR-60/FR-61). Sibling of `InputExercise.tsx` (task 12), same contract and
 * the same interaction shape — the two differ only in what's shown as the prompt and in
 * always expecting a Polish answer (`grade.ts#answerLanguage`'s `form-input` branch is
 * unconditionally `'pl'`, unlike `input`'s direction-dependent language).
 *
 * `exercise.promptMode` (`exercise.types.ts`'s own doc comment) picks which of
 * `exercise.lemma` (Wariant A, FR-60) / `exercise.hint` (Wariant B, FR-61, the primary
 * translation) is shown as the big prompt. The *other* field is intentionally not rendered
 * before an answer is given — showing the lemma up front on a Wariant B question would
 * hand the user the one thing FR-61 is testing ("нужно сначала вспомнить лемму"); it only
 * appears once `feedback` is non-null, as a small "Лемма" / "Перевод" caption alongside the
 * rest of the post-answer state — never before.
 *
 * Slot display (task step 6): the Polish case + number labels are the primary two lines,
 * the Russian glosses trail as one small caption — `describeDimension`
 * (`learning/skills/dimensions.ts`) already resolves both from `exercise.slot` without this
 * component re-deriving case/number parsing itself.
 */
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { describeDimension } from '@/learning/skills/dimensions.ts'
import { renderDiffHighlight } from '../lib/diff-highlight.tsx'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

type FormInputExerciseData = ExerciseOfType<'form-input'>

const POLISH_SPECIAL_CHARS = ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'] as const

interface InputStateMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly textClassName: string
  readonly borderClassName: string
  readonly diffNode?: ReactNode
}

export function FormInputExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<FormInputExerciseData>) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const answered = feedback !== null

  // Same "adjust state during render" reset pattern as `InputExercise.tsx`/`ChoiceExercise.tsx`.
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

  const primaryPrompt = exercise.promptMode === 'lemma' ? exercise.lemma : exercise.hint
  const secondaryPrompt = exercise.promptMode === 'lemma' ? exercise.hint : exercise.lemma
  const secondaryLabel = exercise.promptMode === 'lemma' ? 'Перевод' : 'Лемма'
  const dimension = describeDimension(exercise.slot)

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

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label="Ответ по-польски"
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

        {!answered && (
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
