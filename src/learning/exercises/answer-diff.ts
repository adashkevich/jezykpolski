/**
 * Побуквенное сравнение введённого ответа с эталоном (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md`
 * §3, FR-58, `spec/architecture.md` §7.3).
 *
 * Чистая функция: две строки -> выровненная посимвольная разметка. Ни I/O, ни `Date.now()`,
 * ни случайности; ничего не знает про React и про то, где результат будет отрисован
 * (`features/session-runner/lib/answer-diff-view.tsx` — единственный рендерер).
 *
 * Почему выравнивание (Левенштейн с восстановлением пути), а не позиционное сравнение
 * «i-й символ против i-го»: при пропущенной или лишней букве позиционное сравнение красит
 * красным весь хвост слова (`ktek` против `kotek` — 4 ошибки из 4), и подсветка перестаёт
 * показывать, где именно ошибка. С выравниванием это ровно одна пропущенная буква. Строки
 * здесь — одно слово или короткая фраза (десятки символов), так что квадратичная DP
 * незаметна.
 *
 * Что НЕ сворачивается: польские диакритики. `o` против `ó` — это `wrong` (красная буква),
 * потому что именно это и тренируется (см. `grade.ts`'s правило 4). Сворачиваются только
 * регистр и русское `ё -> е` — то же послабление, что уже даёт `grade`, и для польского
 * безвредное (в польском `ё` нет), поэтому языковой параметр здесь не нужен.
 */

/** Что случилось с одним символом при выравнивании. */
export type DiffKind =
  /** Символ есть в обеих строках на одной позиции выравнивания. */
  | 'match'
  /** Символы есть в обеих строках, но разные (замена). */
  | 'wrong'
  /** Символ есть только во введённом ответе — лишняя буква. */
  | 'extra'
  /** Символ есть только в эталоне — пропущенная буква. */
  | 'missing'

export interface DiffChar {
  readonly char: string
  readonly kind: DiffKind
}

export interface AnswerDiff {
  /** Введённый пользователем ответ: `match` | `wrong` | `extra`. */
  readonly typed: readonly DiffChar[]
  /** Эталон: `match` | `wrong` | `missing`. */
  readonly expected: readonly DiffChar[]
  /** Строки совпали посимвольно после сворачивания регистра и `ё` — т.е. в `typed`/`expected`
   *  нет ни одного не-`match` символа. */
  readonly equal: boolean
}

/** Тот же первый шаг нормализации, что и в `grade.ts` (trim + схлопывание внутренних
 *  пробелов) — вынесен сюда, чтобы обе стороны сравнения гарантированно совпадали. */
export function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** Регистр + `ё -> е`. Посимвольно, чтобы выравнивание работало с той же гранулярностью,
 *  что и отрисовка (одна ячейка DP = один отображаемый символ). Экспортируется для
 *  `letter-attempt.ts` (задача 29) — побуквенный ввод сравнивает нажатую букву с эталоном
 *  той же нормализацией, что и этот модуль, иначе поведение двух проверок разъедется. */
export function fold(char: string): string {
  const lower = char.toLowerCase()
  return lower === 'ё' ? 'е' : lower
}

type Op = 'match' | 'substitute' | 'delete' | 'insert'

/** Матрица расстояния Левенштейна для `a -> b` (по свёрнутым символам). */
function distanceMatrix(a: readonly string[], b: readonly string[]): number[][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j - 1]! + substitutionCost,
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
      )
    }
  }
  return dp
}

/**
 * Восстановление пути от конца к началу. Диагональ проверяется первой, поэтому при равной
 * стоимости предпочитается замена, а не пара «удаление + вставка» — для строк одинаковой
 * длины это даёт ожидаемое «буква против буквы» вместо рассыпающегося на два ряда диффа.
 */
function backtrack(dp: readonly number[][], a: readonly string[], b: readonly string[]): Op[] {
  const ops: Op[] = []
  let i = a.length
  let j = b.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      if (dp[i]![j] === dp[i - 1]![j - 1]! + substitutionCost) {
        ops.push(substitutionCost === 0 ? 'match' : 'substitute')
        i--
        j--
        continue
      }
    }
    if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      ops.push('delete')
      i--
      continue
    }
    ops.push('insert')
    j--
  }

  return ops.reverse()
}

/**
 * `diffAnswer('ktek', 'kotek')` -> `typed: k,t,e,k` (все `match`), `expected: k,o(missing),t,e,k`.
 *
 * Пустой `typed` — законный вход (пользователь ничего не ввёл): `typed` пуст, весь эталон
 * помечен `missing`.
 */
export function diffAnswer(typed: string, expected: string): AnswerDiff {
  const typedChars = Array.from(collapseWhitespace(typed))
  const expectedChars = Array.from(collapseWhitespace(expected))
  const foldedTyped = typedChars.map(fold)
  const foldedExpected = expectedChars.map(fold)

  const ops = backtrack(distanceMatrix(foldedTyped, foldedExpected), foldedTyped, foldedExpected)

  const typedOut: DiffChar[] = []
  const expectedOut: DiffChar[] = []
  let i = 0
  let j = 0
  let equal = true

  for (const op of ops) {
    switch (op) {
      case 'match':
        typedOut.push({ char: typedChars[i]!, kind: 'match' })
        expectedOut.push({ char: expectedChars[j]!, kind: 'match' })
        i++
        j++
        break
      case 'substitute':
        typedOut.push({ char: typedChars[i]!, kind: 'wrong' })
        expectedOut.push({ char: expectedChars[j]!, kind: 'wrong' })
        equal = false
        i++
        j++
        break
      case 'delete':
        typedOut.push({ char: typedChars[i]!, kind: 'extra' })
        equal = false
        i++
        break
      case 'insert':
        expectedOut.push({ char: expectedChars[j]!, kind: 'missing' })
        equal = false
        j++
        break
    }
  }

  return { typed: typedOut, expected: expectedOut, equal }
}

/**
 * Ближайший по расстоянию Левенштейна вариант из `candidates` — с ним и сравнивается ввод.
 * Нужен там, где принятых ответов несколько (`input` PL->RU несёт все переводы значения,
 * `form-input` — несколько допустимых написаний формы): дифф против `accepted[0]` показывал
 * бы отличия от произвольного синонима, а не от того слова, которое пользователь на самом
 * деле пытался написать.
 *
 * При равном расстоянии побеждает более ранний кандидат (`accepted[0]` — канонический,
 * тот же, что показывает `correctAnswerOf`). Пустой список — ошибка вызывающего кода.
 */
export function pickClosestExpected(typed: string, candidates: readonly string[]): string {
  if (candidates.length === 0) {
    throw new Error('pickClosestExpected: empty candidate list')
  }
  const foldedTyped = Array.from(collapseWhitespace(typed)).map(fold)

  let best = candidates[0]!
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const folded = Array.from(collapseWhitespace(candidate)).map(fold)
    const distance = distanceMatrix(foldedTyped, folded)[foldedTyped.length]![folded.length]!
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}
