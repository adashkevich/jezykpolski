/**
 * Побуквенный ввод ответа (`spec/tasks/29-letter-by-letter-input.md` §3, FR-59, FR-84,
 * FR-85, FR-86) — общий UI для `InputExercise` (этап 2, "напиши по-польски") и
 * `FormInputExercise` (одна форма слова): ряд слотов по букве вместо текстового поля,
 * мгновенная зелёная/красная подсветка, кнопка «Подсказка» (открыть текущую букву) и
 * «Показать слово» (раскрыть всё и сразу же провалить задание, FR-85).
 *
 * Вся логика набора — в чистом `learning/exercises/letter-attempt.ts`, этот компонент
 * только рисует его состояние и переводит события клавиатуры/мыши в вызовы этого модуля.
 *
 * Захват ввода — настоящий `<input>` (`opacity-0`) поверх ряда слотов, а не `onKeyDown` на
 * фокусируемом `div`: (1) софт-клавиатура на телефоне открывается только по фокусу
 * редактируемого поля; (2) Android-IME отдаёт `keydown` с `keyCode 229` и без осмысленного
 * `key` во время композиции — `onKeyDown` там нечитаем в принципе, `onChange` с дельтой
 * значения работает всегда. `role="textbox"` и `aria-label` от этого не меняются, так что
 * e2e-хелперы и a11y-дерево видят то же самое, что и раньше. Каретка приколота к концу поля
 * (`onSelect`/`onClick` -> `setSelectionRange`), поэтому дельта `onChange` — всегда суффикс
 * (или, при бэкспейсе, укорочение) относительно уже показанного значения; закалка
 * `autoCapitalize`/`autoCorrect`/`autoComplete="off"`/`spellCheck={false}` унаследована от
 * старого текстового поля дословно.
 *
 * Автозавершение (`onComplete`) вызывается прямо из обработчика события (`onChange`/клика
 * по кнопке), не из эффекта — `react-hooks/purity` и `react-hooks/set-state-in-effect`
 * запрещают импуры/`setState` в эффектах в этом проекте.
 */
import { Eye, Lightbulb } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  attemptValue,
  createLetterAttempt,
  eraseLetter,
  outcomeOf,
  revealAll,
  revealCurrentLetter,
  submittedAnswer,
  typeLetters,
  type CellState,
  type LetterAttempt,
  type TypedAttemptOutcome,
} from '@/learning/exercises/letter-attempt.ts'

const POLISH_SPECIAL_CHARS = ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'] as const

/** NFR-11 — цвет никогда не единственный признак; каждое небезупречное состояние несёт ещё
 *  и форму подчёркивания (сплошное/пунктирное) или начертание, ровно как `AnswerDiff.tsx`'s
 *  `KIND_CLASS` для той же цели. */
const CELL_CLASS: Readonly<Record<CellState, string>> = {
  empty: 'border-border text-transparent',
  correct: 'border-success text-success',
  corrected: 'border-warning text-warning underline decoration-warning decoration-dotted decoration-2',
  wrong: 'border-error bg-error/15 font-bold text-error underline decoration-error decoration-2',
  hinted: 'border-warning text-warning underline decoration-warning decoration-dotted decoration-2',
  revealed: 'border-muted-foreground text-muted-foreground italic underline decoration-dotted decoration-2',
  separator: 'border-transparent',
}

/** Слоты должны влезать в 320px даже для самых длинных форм (`będziemy robić` — 14 букв +
 *  пробел) — критерий приёмки MVP №14. Ширина падает по мере роста слова, ряд ещё и
 *  переносится (`flex-wrap`) на случай совсем длинных фраз. */
function slotWidthClass(letterCount: number): string {
  if (letterCount <= 10) return 'w-8 text-lg'
  if (letterCount <= 14) return 'w-7 text-base'
  return 'w-6 text-sm'
}

export interface LetterSlotsInputProps {
  readonly accepted: readonly string[]
  /** Ряд быстрого ввода польских диакритик — только когда ожидаемый ответ польский. */
  readonly showPolishKeys: boolean
  readonly ariaLabel: string
  readonly disabled: boolean
  /** `feedback !== null` у вызывающего компонента — замораживает поле и прячет кнопки,
   *  ровно как раньше `answered` у текстового поля. */
  readonly answered: boolean
  onComplete(answer: string, outcome: TypedAttemptOutcome): void
}

export function LetterSlotsInput({
  accepted,
  showPolishKeys,
  ariaLabel,
  disabled,
  answered,
  onComplete,
}: LetterSlotsInputProps) {
  const [attempt, setAttempt] = useState<LetterAttempt>(() => createLetterAttempt(accepted))
  const [liveMessage, setLiveMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const descriptionId = useId()
  const revealWarningId = useId()

  // "Adjust state during render" — тот же паттерн, что и у старого текстового поля
  // (`InputExercise.tsx`/`ChoiceExercise.tsx`): `ActiveQuestion` и так перемонтирует этот
  // компонент по `key={instance.id}` при смене вопроса, но полагаться на это снаружи
  // небезопасно, а сброс типизированного ввода — не эффект.
  const [lastAccepted, setLastAccepted] = useState(accepted)
  if (accepted !== lastAccepted) {
    setLastAccepted(accepted)
    setAttempt(createLetterAttempt(accepted))
    setLiveMessage('')
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const letterCount = attempt.cells.filter((cell) => cell.state !== 'separator').length
  const widthClass = slotWidthClass(letterCount)
  const frozen = disabled || answered || attempt.complete

  function commitIfComplete(next: LetterAttempt) {
    setAttempt(next)
    if (next.complete) {
      onComplete(submittedAnswer(next), outcomeOf(next))
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (frozen) return
    const prevChars = Array.from(attemptValue(attempt))
    const rawChars = Array.from(event.target.value)

    if (rawChars.length < prevChars.length) {
      // Backspace (или выделение и удаление) — `eraseLetter` стирает только текущую
      // неверную ячейку, подтверждённые буквы не трогает, так что лишние удаления просто
      // не действуют. Раз за разом на случай удаления нескольких символов сразу.
      let next = attempt
      for (let i = 0; i < prevChars.length - rawChars.length; i++) {
        next = eraseLetter(next)
      }
      setAttempt(next)
      return
    }

    const added = rawChars.slice(prevChars.length).join('')
    if (added.length === 0) return
    const next = typeLetters(attempt, added)
    const cursorCell = next.cells[next.cursor]
    setLiveMessage(cursorCell?.state === 'wrong' ? 'Неверная буква' : '')
    commitIfComplete(next)
  }

  function pinCaretToEnd() {
    const el = inputRef.current
    if (!el) return
    const end = el.value.length
    el.setSelectionRange(end, end)
  }

  function applyPolishChar(char: string) {
    if (frozen) return
    const next = typeLetters(attempt, char)
    setLiveMessage('')
    commitIfComplete(next)
    inputRef.current?.focus()
  }

  function handleHint() {
    if (frozen) return
    const next = revealCurrentLetter(attempt)
    const hintedChar = attempt.cells[attempt.cursor]?.expected
    setLiveMessage(hintedChar ? `Подсказка: ${hintedChar}` : '')
    commitIfComplete(next)
    inputRef.current?.focus()
  }

  function handleReveal() {
    if (frozen) return
    const next = revealAll(attempt)
    setLiveMessage('Слово показано целиком')
    // `revealAll` всегда даёт `complete: true` — вызываем `onComplete` напрямую, а не через
    // `commitIfComplete`, чтобы не дублировать проверку.
    setAttempt(next)
    onComplete(submittedAnswer(next), outcomeOf(next))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          value={attemptValue(attempt)}
          disabled={frozen}
          onChange={handleChange}
          onSelect={pinCaretToEnd}
          onClick={pinCaretToEnd}
          className="absolute inset-0 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        />
        <p id={descriptionId} className="sr-only">
          Слово из {letterCount} букв. Вводите буквы по порядку — неверная буква заменяется
          следующим нажатием.
        </p>
        <div
          aria-hidden="true"
          className="flex flex-wrap justify-center gap-1 rounded-lg border border-transparent px-2 py-1"
        >
          {attempt.cells.map((cell, index) =>
            cell.state === 'separator' ? (
              <span key={index} className="w-3" />
            ) : (
              <span
                key={index}
                data-cell-state={cell.state}
                className={cn(
                  'flex h-12 items-end justify-center border-b-2 pb-1 font-mono transition-colors motion-reduce:transition-none',
                  widthClass,
                  CELL_CLASS[cell.state],
                )}
              >
                {cell.shown ?? '_'}
              </span>
            ),
          )}
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {!answered && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || attempt.complete}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleHint}
            aria-label="Подсказка: показать следующую букву"
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            <Lightbulb aria-hidden="true" className="size-4" />
            Подсказка
          </button>
          <button
            type="button"
            disabled={disabled || attempt.complete}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleReveal}
            aria-label="Показать слово"
            aria-describedby={revealWarningId}
            className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            <Eye aria-hidden="true" className="size-4" />
          </button>
          <p id={revealWarningId} className="text-xs text-muted-foreground">
            Показать слово — задание засчитается как ошибка
          </p>
        </div>
      )}

      {showPolishKeys && !answered && (
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
              disabled={disabled || attempt.complete}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyPolishChar(char)}
              className="flex size-11 items-center justify-center rounded-md border border-border text-base text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            >
              {char}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
