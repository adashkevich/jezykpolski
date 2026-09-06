/**
 * Побуквенный ввод ответа (`spec/tasks/29-letter-by-letter-input.md` §1, FR-59, FR-84,
 * FR-85, FR-86). Чистая машина состояний: одна ячейка на букву эталона, проверка каждой
 * буквы в момент нажатия, неверная буква заменяется следующим нажатием, а не сдвигает
 * курсор дальше. Ни React, ни Dexie (`src/learning/**` — чистый слой, `architecture.md` §3).
 *
 * Нормализация при сравнении нажатой буквы с эталоном — та же, что и у `answer-diff.ts`
 * (регистр + `ё -> е`, польские диакритики НЕ сворачиваются: `o` против `ó` — ошибка,
 * это и тренируется), переиспользуем его `fold`/`collapseWhitespace`, чтобы два способа
 * проверки ответа не разъехались.
 *
 * Слоты строятся по `accepted[0]`. Когда у формы несколько допустимых написаний
 * (`form-input`, например `aborcji`/`aborcyj`), кандидатов, отличающихся от канонического
 * ДЛИНОЙ, отбрасываем сразу — число ячеек не может измениться посреди набора, иначе слоты
 * «прыгали» бы. Среди вариантов равной длины кандидаты сужаются по мере ввода: пользователь,
 * набравший верное второе написание, не должен получать красную букву. Для vocab `input`
 * `accepted` — всегда один лемма (`generate.ts#buildVocabInput`), так что сужение — no-op.
 *
 * Разделители (пробел, дефис, апостроф — `będziemy robić`, `uczyć się`) заполняются сами и
 * не считаются буквенными ячейками: курсор их пропускает, ввод разделителя — no-op.
 */
import { collapseWhitespace, fold } from './answer-diff.ts'

export type CellState =
  | 'empty'
  | 'correct'
  | 'corrected'
  | 'wrong'
  | 'hinted'
  | 'revealed'
  | 'separator'

export interface LetterCell {
  /** Эталонный символ в исходном регистре кандидата, который сейчас представляют слоты. */
  readonly expected: string
  /** Что рисовать в ячейке; `null` — ещё пусто. */
  readonly shown: string | null
  readonly state: CellState
}

/** Итог попытки — то, что уходит в `policy.ts#mapResultToRating` (задача 29 §2). */
export interface TypedAttemptOutcome {
  readonly mistakes: number
  readonly hintsUsed: number
  readonly revealed: boolean
  /** Сколько всего буквенных (не `separator`) ячеек — нужно `policy.ts`, чтобы отличить
   *  «пара подсказок» от «подсказками открыто всё слово» (последнее приравнивается к
   *  «глазку», FR-86). */
  readonly letterCount: number
}

export interface LetterAttempt {
  readonly cells: readonly LetterCell[]
  /** Ещё не отсечённые принятые варианты — все той же длины, что и `cells`. */
  readonly candidates: readonly string[]
  /** `candidates[0]` — вариант, который сейчас представляют слоты. */
  readonly expected: string
  /** Индекс ближайшей незаполненной буквенной ячейки; `cells.length`, когда всё заполнено. */
  readonly cursor: number
  readonly mistakes: number
  readonly hintsUsed: number
  readonly revealed: boolean
  readonly complete: boolean
  /** Сколько первых ячеек `cells` разрешено показывать (задача 30, FR-53/FR-59/FR-136/
   *  FR-84-86): все заполненные, разделители сразу за ними, и один активный пустой слот,
   *  если слово ещё не закончилось. Никогда не больше `cells.length`. Чисто про отрисовку —
   *  проверка букв и автозавершение работают по полному `cells`. */
  readonly visibleCount: number
}

/** `!/\p{L}/u` одним правилом покрывает пробел, дефис, апостроф — без списка исключений. */
function isSeparator(char: string): boolean {
  return !/\p{L}/u.test(char)
}

/** Первая незаполненная буквенная ячейка начиная с `from` (включительно); `cells.length`,
 *  если такой нет. Разделители пропускаются — они не участвуют в наборе. */
function nextCursor(cells: readonly LetterCell[], from: number): number {
  let i = from
  while (i < cells.length && cells[i]!.state !== 'empty' && cells[i]!.state !== 'wrong') {
    i++
  }
  return i
}

function buildCells(canonical: readonly string[]): LetterCell[] {
  return canonical.map((ch) =>
    isSeparator(ch)
      ? { expected: ch, shown: ch, state: 'separator' as const }
      : { expected: ch, shown: null, state: 'empty' as const },
  )
}

/** Сколько первых ячеек `cells` разрешено показывать (задача 30, FR-53/FR-59/FR-136/
 *  FR-84-86): все уже заполненные буквенные ячейки плюс один активный слот на `cursor`.
 *  `cursor` — уже сырой индекс в `cells` (см. `nextCursor`), и он получается, только пройдя
 *  все разделители перед активной буквой, так что отдельно их подсчитывать не нужно — они
 *  сидят на индексах меньше `cursor` и попадают в `cells.slice(0, visibleCount)` сами по себе;
 *  это и есть «разделитель всплывает вместе со слотом следующей за ним буквы» из спеки.
 *  `cursor >= cells.length` (слово набрано/раскрыто) — открыт весь ряд. */
export function computeVisibleCount(cells: readonly LetterCell[], cursor: number): number {
  return Math.min(cursor + 1, cells.length)
}

export function createLetterAttempt(accepted: readonly string[]): LetterAttempt {
  if (accepted.length === 0) {
    throw new Error('createLetterAttempt: accepted must not be empty')
  }
  const canonical = Array.from(collapseWhitespace(accepted[0]!))
  const candidates = accepted
    .map(collapseWhitespace)
    .filter((candidate) => Array.from(candidate).length === canonical.length)
  const cells = buildCells(canonical)
  const cursor = nextCursor(cells, 0)
  return {
    cells,
    candidates,
    expected: candidates[0]!,
    cursor,
    mistakes: 0,
    hintsUsed: 0,
    revealed: false,
    complete: false,
    visibleCount: computeVisibleCount(cells, cursor),
  }
}

/** Набор одной буквы (задача 29 §1: верная — заполняет ячейку эталонным символом и двигает
 *  курсор; неверная — заполняет нажатым символом, курсор стоит на месте, следующее нажатие
 *  её заменит). No-op, если попытка уже завершена, буква — разделитель, или `char` — пустая
 *  строка (защита от случайного вызова на пустом значении инпута). */
export function typeLetter(state: LetterAttempt, char: string): LetterAttempt {
  if (state.complete || state.revealed || char.length === 0) return state
  if (isSeparator(char)) return state

  const index = state.cursor
  if (index >= state.cells.length) return state
  const cell = state.cells[index]!

  const matching = state.candidates.filter(
    (candidate) => fold(Array.from(candidate)[index]!) === fold(char),
  )

  if (matching.length > 0) {
    const nextExpectedChar = Array.from(matching[0]!)[index]!
    const cells = state.cells.slice()
    cells[index] = {
      expected: nextExpectedChar,
      shown: nextExpectedChar,
      state: cell.state === 'wrong' ? 'corrected' : 'correct',
    }
    const cursor = nextCursor(cells, index + 1)
    return {
      ...state,
      cells,
      candidates: matching,
      expected: matching[0]!,
      cursor,
      complete: cursor >= cells.length,
      visibleCount: computeVisibleCount(cells, cursor),
    }
  }

  // Неверная буква. Ошибка считается один раз на ячейку — повторный неверный набор в той же
  // ячейке (пока не угадал) не увеличивает счётчик, иначе перебор вариантов на одном слоте
  // штрафовался бы сильнее, чем одна ошибка в другом слоте. Курсор не двигается, значит и
  // `visibleCount` не растёт (задача 30: неверная буква не должна открывать новый слот).
  const cells = state.cells.slice()
  cells[index] = { ...cell, shown: char, state: 'wrong' }
  return {
    ...state,
    cells,
    mistakes: state.mistakes + (cell.state === 'wrong' ? 0 : 1),
    visibleCount: computeVisibleCount(cells, state.cursor),
  }
}

/** Набор нескольких букв подряд — удобно для вставки нескольких символов сразу (мобильный
 *  автокомплит, программный набор в тестах) и для дельты `onChange` в `LetterSlotsInput`. */
export function typeLetters(state: LetterAttempt, chars: string): LetterAttempt {
  let next = state
  for (const char of chars) {
    next = typeLetter(next, char)
  }
  return next
}

/** Backspace. Стирает только ячейку в состоянии `wrong` — подтверждённые буквы (`correct`/
 *  `corrected`) не трогаем: курсор монотонен, а разрешить их стирать значило бы пересчитывать
 *  `candidates` назад, чего не требует ни один из принятых сценариев UI. No-op, если стирать
 *  нечего (курсор на `empty`, попытка завершена/раскрыта). */
export function eraseLetter(state: LetterAttempt): LetterAttempt {
  if (state.complete || state.revealed) return state
  const index = state.cursor
  const cell = state.cells[index]
  if (!cell || cell.state !== 'wrong') return state
  const cells = state.cells.slice()
  cells[index] = { ...cell, shown: null, state: 'empty' }
  // Курсор стирание не двигает (стирается только ячейка на текущем курсоре), так что
  // `visibleCount` возвращается ровно к значению, которое было до неверной буквы — задача 30
  // §1 п.3: бэкспейс не должен становиться способом «прощупать» длину слова, отматывая ряд
  // дальше назад, чем он был.
  return { ...state, cells, visibleCount: computeVisibleCount(cells, state.cursor) }
}

/** Кнопка «Подсказка» — открывает текущую (следующую незаполненную/неверную) букву. */
export function revealCurrentLetter(state: LetterAttempt): LetterAttempt {
  if (state.complete || state.revealed) return state
  const index = state.cursor
  if (index >= state.cells.length) return state
  const cell = state.cells[index]!
  const cells = state.cells.slice()
  cells[index] = { ...cell, shown: cell.expected, state: 'hinted' }
  const cursor = nextCursor(cells, index + 1)
  return {
    ...state,
    cells,
    hintsUsed: state.hintsUsed + 1,
    cursor,
    complete: cursor >= cells.length,
    visibleCount: computeVisibleCount(cells, cursor),
  }
}

/** Кнопка «Показать слово» — раскрывает всё сразу и немедленно завершает попытку как
 *  проваленную (FR-85). Уже верно набранные буквы остаются зелёными — видно, докуда
 *  пользователь дошёл сам. */
export function revealAll(state: LetterAttempt): LetterAttempt {
  if (state.complete) return state
  const cells = state.cells.map((cell) =>
    cell.state === 'empty' || cell.state === 'wrong'
      ? { ...cell, shown: cell.expected, state: 'revealed' as const }
      : cell,
  )
  // «Показать слово» раскрывает ряд целиком (FR-85) — `visibleCount` выставляется в
  // `cells.length` напрямую, а не через `computeVisibleCount`, это единственное
  // предусмотренное спекой (задача 30 §1 п.4) исключение из «курсор + 1».
  return { ...state, cells, revealed: true, complete: true, cursor: cells.length, visibleCount: cells.length }
}

/** Строка для `value` скрытого `<input>` — конкатенация того, что сейчас показано. Пустые
 *  ячейки дают пустую строку (а не placeholder-символ) — они не часть введённого текста. */
export function attemptValue(state: LetterAttempt): string {
  return state.cells.map((cell) => cell.shown ?? '').join('')
}

/** Что уходит в `onAnswer` / `grade()`. Не раскрыто — полная строка выбранного варианта
 *  (пользователь и правда набрал её всю, буква за буквой). Раскрыто «глазком» — только
 *  подтверждённый пользователем префикс: `grade()` честно вернёт `correct: false`, а список
 *  ошибок на экране результатов покажет осмысленный дифф «osią -> osiągnąć», а не
 *  тождественную пару и не голое «—». */
export function submittedAnswer(state: LetterAttempt): string {
  if (!state.revealed) return state.expected
  let prefix = ''
  for (const cell of state.cells) {
    if (cell.state === 'separator' || cell.state === 'correct' || cell.state === 'corrected') {
      prefix += cell.shown ?? ''
    } else {
      break
    }
  }
  return prefix
}

export function outcomeOf(state: LetterAttempt): TypedAttemptOutcome {
  const letterCount = state.cells.filter((cell) => cell.state !== 'separator').length
  return {
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    revealed: state.revealed,
    letterCount,
  }
}
