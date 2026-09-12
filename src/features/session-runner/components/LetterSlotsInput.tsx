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
 *
 * Прогрессивное раскрытие ячеек (`spec/tasks/30-progressive-letter-slots.md`, FR-53/FR-59
 * (переформулирован)/FR-136/FR-84-86): длина слова — сильная подсказка сама по себе, поэтому
 * рисуется не весь `attempt.cells`, а только `attempt.cells.slice(0, attempt.visibleCount)` —
 * вся арифметика того, что считается видимым, живёт в чистом
 * `letter-attempt.ts#computeVisibleCount`, этот компонент только берёт готовое число. Ширина
 * ячейки — фиксированная константа (не зависит от длины слова, это тоже было утечкой длины),
 * ряд переносится `flex-wrap` и скроллится по горизонтали внутри своего контейнера, если не
 * помещается — страница целиком по горизонтали не скроллится.
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
 *  `KIND_CLASS` для той же цели.
 *
 *  **Изменено задачей 36** (`spec/tasks/36-practice-screen-restructure.md` §5, FR-151):
 *  `revealed` раньше красился в приглушённый `text-muted-foreground` и курсив — по запросу
 *  пользователя раскрытое кнопкой «Показать слово» слово теперь рисуется обычным цветом текста
 *  (`text-foreground`) и обычным начертанием; единственный оставшийся неcветовой признак —
 *  пунктирное подчёркивание, которого NFR-11 и требует. */
const CELL_CLASS: Readonly<Record<CellState, string>> = {
  empty: 'border-track text-transparent',
  correct: 'border-success text-success',
  corrected: 'border-warning text-warning underline decoration-warning decoration-dotted decoration-2',
  wrong: 'border-error bg-error/15 font-bold text-error underline decoration-error decoration-2',
  hinted: 'border-warning text-warning underline decoration-warning decoration-dotted decoration-2',
  revealed: 'border-muted-foreground text-foreground underline decoration-dotted decoration-2',
  separator: 'border-transparent',
}

/** Фиксированная ширина ячейки (задача 30 §2 п.2) — она не вычисляется от количества букв
 *  (это была бы прямая утечка длины слова через вёрстку ещё до первого нажатия), но и слишком
 *  широкой быть не должна: по запросу пользователя в одну строку на стандартном экране обязаны
 *  помещаться минимум 10 слотов подряд. Бюджет самого узкого поддерживаемого экрана (320px):
 *  320 − 32 (`PageContainer` `px-4`) − 2 (рамка карточки) − 16 (`px-2` ряда) = 270px, а
 *  10 × 24px + 9 × 2px промежутка = 258px — влезает с запасом. От `min-[480px]` (там
 *  `PageContainer` переходит на `px-6`) ячейка и промежуток подрастают до 36/4px, что на
 *  480px даёт 10 × 36 + 9 × 4 = 396px против 406px доступных — десять слотов держатся и там,
 *  просто выглядят просторнее.
 *
 *  Высота остаётся `h-11`: тач-таргет ≥44px (критерий приёмки MVP №14). Ряд по-прежнему
 *  переносится `flex-wrap`, а контейнер скроллится по горизонтали (`overflow-x-auto`), если
 *  слотов всё равно больше, чем влезает — страница на 320px вбок не скроллится.
 *
 *  `min-w-*`, а не `w-*`: это пол, а не потолок — широкая буква («w», «m») раздвигает свою
 *  ячейку сама, вместо того чтобы вылезти за её границы. */
const SLOT_CLASS = 'h-11 min-w-6 text-headline-md min-[480px]:min-w-9'

/** Secondary white "chip" controls under the slots (`spec/design/task-input.png`). */
const TOOL_BUTTON_CLASS =
  'flex min-h-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-card outline-none transition-colors hover:bg-surface-low focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'

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

  const frozen = disabled || answered || attempt.complete
  const visibleCells = attempt.cells.slice(0, attempt.visibleCount)

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
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl border border-border bg-card shadow-card">
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
          // `text-base` (16px, unconditionally — not `text-base md:text-sm` like
          // `CONTROL_CLASS`): this field is `opacity-0` and only ever exists to catch focus/
          // keyboard input for the visible slot row below it, so its own font-size is never
          // seen at any width. It still needs to compute to ≥16px, though — iOS Safari's
          // auto-zoom keys off the focused element's computed font-size regardless of
          // visibility (task 34, `spec/tasks/34-viewport-zoom-fix.md` §2 point 3).
          className="absolute inset-0 h-full w-full cursor-text text-base opacity-0 disabled:cursor-not-allowed"
        />
        <p id={descriptionId} className="sr-only">
          Вводите буквы по порядку — неверная буква заменяется следующим нажатием.
        </p>
        <div aria-hidden="true" className="overflow-x-auto px-2 py-4 min-[480px]:px-3">
          {/* **Изменено задачей 36** (`spec/tasks/36-practice-screen-restructure.md` §5,
              FR-151) — задача 30 §2.3 требовала выравнивания по левому краю ("уже набранные
              буквы не «прыгали» при добавлении слота"); по прямому запросу пользователя ряд
              теперь центрируется. Контейнер выше остаётся `overflow-x-auto`, так что длинное
              слово по-прежнему скроллится внутри себя, а не растягивает страницу на 320px. */}
          <div className="flex flex-wrap justify-center gap-0.5 min-[480px]:gap-1">
            {visibleCells.map((cell, index) =>
              cell.state === 'separator' ? (
                // Пробел между словами: заметно шире обычного промежутка между буквами
                // (`gap-0.5`), иначе «będziemy robić» читается как одно слово.
                <span key={index} className="w-2 min-[480px]:w-3" />
              ) : (
                <span
                  key={index}
                  data-cell-state={cell.state}
                  className={cn(
                    'flex items-end justify-center border-b-[3px] pb-0.5 font-semibold transition-colors motion-reduce:transition-none',
                    SLOT_CLASS,
                    CELL_CLASS[cell.state],
                  )}
                >
                  {cell.shown ?? '_'}
                </span>
              ),
            )}
          </div>
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
            className={cn(TOOL_BUTTON_CLASS, 'gap-2 px-4 text-label-lg')}
          >
            <Lightbulb aria-hidden="true" className="size-5 text-warning" />
            Подсказка
          </button>
          <button
            type="button"
            disabled={disabled || attempt.complete}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleReveal}
            aria-label="Показать слово"
            aria-describedby={revealWarningId}
            className={cn(TOOL_BUTTON_CLASS, 'size-11')}
          >
            <Eye aria-hidden="true" className="size-5" />
          </button>
          <p id={revealWarningId} className="text-body-sm text-muted-foreground">
            Показать слово — задание засчитается как ошибка
          </p>
        </div>
      )}

      {showPolishKeys && !answered && (
        <div className="flex flex-col gap-2">
          <p aria-hidden="true" className="text-body-sm text-muted-foreground">
            Польские символы
          </p>
          <div
            role="group"
            aria-label="Быстрый ввод польских диакритических знаков"
            className="flex flex-wrap gap-1.5"
          >
            {POLISH_SPECIAL_CHARS.map((char) => (
              <button
                key={char}
                type="button"
                aria-label={`Вставить «${char}»`}
                disabled={disabled || attempt.complete}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyPolishChar(char)}
                className={cn(TOOL_BUTTON_CLASS, 'size-11 text-body-lg font-medium')}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
