/**
 * Побуквенная отрисовка результата проверки (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md`
 * §3, FR-58, NFR-11). Единственный рендерер `@/learning/exercises/answer-diff.ts` во всём
 * приложении: ячейки таблиц склонения/спряжения и список ошибок на экране результатов
 * используют эти компоненты, а не свою разметку.
 *
 * Task 29 (`spec/tasks/29-letter-by-letter-input.md` §4): `input`/`form-input` больше не
 * проверяются вводом целой строки — там теперь `LetterSlotsInput` с побуквенной подсветкой
 * прямо во время набора (FR-59), и панель `ExerciseFeedback` не нуждается в отдельном
 * "Ты написал / Правильно". Раньше этот файл экспортировал `AnswerDiffLines` ровно для
 * неё — с уходом единственного потребителя эта функция удалена; `DiffText`/
 * `ExpectedDiffLine` остаются ради таблиц и экрана результатов.
 *
 * Живёт в `components/app/**`, а не внутри `features/session-runner/**`, именно потому, что
 * пользователей два разных раздела (`features/session-runner`, `pages/session/SessionResultPage`)
 * — то же основание, по которому здесь уже лежат `EmptyState`/`ErrorState`.
 *
 * Чистая презентация над данными, которые посчитала доменная функция; здесь не вызывается ни
 * `grade()`, ни что-либо из `@/db/**`.
 *
 * Цвета — существующие семантические токены `--success`/`--error` (`app/styles/globals.css`).
 * В светлой теме они специально затемнены под WCAG AA на фонах `--background`, `--card` и
 * тинтах `/10` (см. комментарий в самом `globals.css`), а в тёмной заменены на осветлённую
 * пару, поэтому дифф читается и в панели `bg-error/10`, и в белой ячейке таблицы, и на
 * тёмном фоне — новых токенов заводить не понадобилось.
 *
 * NFR-11 («не полагаться только на цвет») выполняется тремя независимыми от цвета
 * признаками: неверная буква подчёркнута сплошной линией, лишняя — зачёркнута, пропущенная —
 * подчёркнута пунктиром. Кроме того, визуальный ряд букв целиком помечен `aria-hidden`, а
 * рядом лежит `sr-only`-строка обычным текстом: скринридер читает «kotek», а не «k», «o»,
 * «t», … по одной букве.
 */
import type { DiffChar } from '@/learning/exercises/answer-diff.ts'
import { diffAnswer } from '@/learning/exercises/answer-diff.ts'
import { cn } from '@/lib/utils'

const KIND_CLASS: Readonly<Record<DiffChar['kind'], string>> = {
  match: 'text-success',
  wrong: 'rounded-sm bg-error/15 font-bold text-error underline decoration-error decoration-2 underline-offset-2',
  extra: 'rounded-sm bg-error/15 font-bold text-error line-through decoration-error decoration-2',
  missing:
    'rounded-sm bg-error/15 font-bold text-error underline decoration-error decoration-dotted decoration-2 underline-offset-2',
}

/** Одна строка ответа, раскрашенная по буквам. `whitespace-pre` — чтобы пробел внутри фразы
 *  («będziemy robić») сохранял ширину и подложку, если он оказался ошибкой. */
export function DiffText({
  chars,
  className,
}: {
  readonly chars: readonly DiffChar[]
  readonly className?: string
}) {
  return (
    <span className={cn('font-mono whitespace-pre', className)}>
      <span className="sr-only">{chars.map((c) => c.char).join('')}</span>
      <span aria-hidden="true">
        {chars.map((c, index) => (
          <span key={index} className={KIND_CLASS[c.kind]}>
            {c.char}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * Компактный вариант для плотных сеток (таблицы склонения и спряжения): только эталон,
 * раскрашенный по буквам — зелёные буквы пользователь угадал, красные нет. Свой ввод здесь не
 * повторяется: он остаётся в самом (заблокированном после проверки) поле прямо над строкой, а
 * второй ряд букв в ячейке шириной ~6rem превратил бы таблицу в кашу.
 */
export function ExpectedDiffLine({
  typed,
  expected,
  className,
}: {
  readonly typed: string
  readonly expected: string
  readonly className?: string
}) {
  const diff = diffAnswer(typed, expected)
  return (
    <p className={cn('mt-0.5 text-xs', className)}>
      <span className="sr-only">Правильно: </span>
      <span aria-hidden="true" className="text-muted-foreground">
        →{' '}
      </span>
      <DiffText chars={diff.expected} className="text-xs" />
    </p>
  )
}
