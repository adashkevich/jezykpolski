# 29 — Побуквенный ввод ответа

**Зависит от:** 12, 13, 18, 28
**Результат:** упражнения на набор ответа (`input` — этап 2 «напиши по-польски», `form-input`
— форма слова) вместо текстового поля с кнопкой «Проверить» показывают ряд слотов по одной
букве, проверяют каждую букву в момент нажатия, дают подсказку текущей буквы и «глазок» для
раскрытия слова, и завершаются автоматически на последней верной букве.

---

## Требования: FR-53, FR-58 (сужается), FR-59, FR-60, FR-61, FR-84, FR-85, FR-86

## Зачем

До этой задачи `InputExercise`/`FormInputExercise` — обычное текстовое поле: пользователь
печатает вслепую, жмёт «Проверить», и только тогда видит побуквенный дифф (задача 28,
FR-58) в панели `ExerciseFeedback`. Из этого вытекало три проблемы:

1. Длина слова не видна заранее — нет письменной опоры для вспоминания.
2. Ошибка ловится только в конце, а не в момент, когда она сделана.
3. Единственный способ подсмотреть слово — нарочно ответить неправильно и посмотреть на
   дифф после отправки; специального способа попросить букву или всё слово нет.
4. Верно набранный ответ всегда маппится в `Easy` (`policy.ts#mapResultToRating`,
   `answerKind: 'input'`), independent от того, вспомнил ли пользователь слово с первой
   попытки или подобрал его после нескольких попыток и подсказок.

---

## 1. `learning/exercises/letter-attempt.ts` — новый чистый модуль

Машина состояний побуквенного набора. Без React и Dexie (`learning/**` — чистый слой).
Переиспользует `answer-diff.ts`'s `collapseWhitespace`/`fold` (последняя становится
экспортируемой) — та же нормализация при сравнении нажатой буквы с эталоном: регистр и
`ё → е` сворачиваются, польские диакритики — нет (`o` против `ó` — ошибка).

```ts
export type CellState =
  | 'empty' | 'correct' | 'corrected' | 'wrong' | 'hinted' | 'revealed' | 'separator'

export interface LetterCell {
  readonly expected: string      // эталонный символ в исходном регистре
  readonly shown: string | null  // что рисовать; null — ещё пусто
  readonly state: CellState
}

export interface TypedAttemptOutcome {
  readonly mistakes: number
  readonly hintsUsed: number
  readonly revealed: boolean
  readonly letterCount: number
}

export interface LetterAttempt {
  readonly cells: readonly LetterCell[]
  readonly candidates: readonly string[]  // не отсечённые принятые варианты, все равной длины
  readonly expected: string               // candidates[0]
  readonly cursor: number
  readonly mistakes: number
  readonly hintsUsed: number
  readonly revealed: boolean
  readonly complete: boolean
}

export function createLetterAttempt(accepted: readonly string[]): LetterAttempt
export function typeLetter(state: LetterAttempt, char: string): LetterAttempt
export function typeLetters(state: LetterAttempt, chars: string): LetterAttempt
export function eraseLetter(state: LetterAttempt): LetterAttempt
export function revealCurrentLetter(state: LetterAttempt): LetterAttempt
export function revealAll(state: LetterAttempt): LetterAttempt
export function attemptValue(state: LetterAttempt): string
export function submittedAnswer(state: LetterAttempt): string
export function outcomeOf(state: LetterAttempt): TypedAttemptOutcome
```

Правила:

- **Слоты строятся по `accepted[0]`**, кандидатами остаются только варианты **той же
  длины** — число ячеек не может измениться посреди набора. `form-input` иногда допускает
  несколько написаний одной формы (`aborcji`/`aborcyj`); кандидаты сужаются по мере ввода
  среди вариантов равной длины, так что оба доходят до `complete` без единой ошибки. Для
  vocab `input` `accepted` всегда один лемма — сужение там no-op.
- **Разделители** (`!/\p{L}/u` — пробел, дефис, апостроф: `będziemy robić`, `uczyć się`)
  заполнены сразу, курсор их перескакивает, ввод разделителя — no-op.
- **Верная буква** — ячейка получает эталонный символ (регистр эталона, не нажатия),
  `state: 'correct'` (или `'corrected'`, если раньше тут было `'wrong'`), курсор вперёд.
- **Неверная буква** — ячейка получает нажатый символ, `state: 'wrong'`, **курсор не
  двигается**: следующее нажатие её заменяет, а не добавляется рядом. `mistakes` растёт
  один раз на ячейку, а не на нажатие.
- `eraseLetter` (Backspace) стирает только ячейку в состоянии `'wrong'` — подтверждённые
  буквы не трогает: курсор монотонен.
- `revealCurrentLetter` (FR-84) — открывает текущую букву, `hintsUsed += 1`.
- `revealAll` (FR-85) — раскрывает всё сразу, `revealed: true`, `complete: true`
  немедленно; уже верно набранные буквы остаются зелёными.
- `submittedAnswer`: без раскрытия — полная строка эталона; после «глазка» — только
  подтверждённый пользователем префикс (может быть пустым), чтобы `grade()` честно вернул
  `correct: false`, а список ошибок на экране результатов показал осмысленный дифф.
- Все функции иммутабельны.

## 2. `learning/srs/policy.ts` — рейтинг побуквенной попытки

Третий, структурно самостоятельный вариант `ExerciseGradeResult` (модуль по-прежнему не
зависит от `learning/exercises/**`):

```ts
export interface TypedAttemptResult {
  readonly mistakes: number
  readonly hintsUsed: number
  readonly revealed: boolean
  readonly letterCount: number
}

export function mapResultToRating(result: ExerciseGradeResult): Rating {
  if ('rating' in result) return result.rating
  if ('revealed' in result) {
    if (result.revealed || result.hintsUsed >= result.letterCount) return AGAIN
    return result.mistakes > 0 || result.hintsUsed > 0 ? HARD : EASY
  }
  // ...существующие ветки choice/input
}
```

`revealed` (или все буквы открыты подсказками — то же самое по сути) → `Again` (FR-85).
Хотя бы одна ошибка или подсказка → `Hard`, а не `Again` (FR-86): единственная описка в
диакритике не должна сбрасывать навык в relearning с нуля — этап 2 иначе непроходим. `Hard`
уже несёт в этом коде нужную семантику («вспомнил, но с трудом»): интервал растёт слабо,
`aggregate.ts#deriveStatus` не даёт слову `known` без настоящего повторения. Чисто — `Easy`,
как и раньше.

## 3. Прокидывание итога попытки в пайплайн

- `exercise-props.types.ts`: `onAnswer(answer: string, attempt?: TypedAttemptOutcome): void`
  — необязательный второй аргумент, остальные компоненты его не передают.
- `answer-pipeline.ts`: `SubmitAnswerInput.attempt?: TypedAttemptResult`. Когда задан,
  рейтинг берётся из него; `grade()`, FSRS, `unlockProductionStage`, `computeWordProgress`,
  `applyAnswer` — без изменений. `GradeResult.correct` не переопределяется — оно по-прежнему
  значит «финальная строка совпала с принятым ответом»; на нём висят
  `SkillRecord.correct/incorrect`, список ошибок, матрица путаницы.

  | Сценарий | `answerGiven` | `correct` | `rating` |
  |---|---|---|---|
  | Набрал чисто | полное слово | `true` | Easy (Practice → Good) |
  | С ошибкой/подсказкой | полное слово | `true` | Hard |
  | «Глазок» / все буквы подсказками | подтверждённый префикс | `false` | Again |

- **Реквей внутри сессии** (`SessionRunner.tsx#handleAnswer`): условие
  `!result.gradeResult.correct` → `result.rating <= HARD` — слово, набранное с подсказкой,
  тоже возвращается в очередь ещё в этой сессии (FR-86).

## 4. `features/session-runner/components/LetterSlotsInput.tsx` — общий компонент

Один компонент для `InputExercise` и `FormInputExercise` — ряд слотов, подсказка, «глазок»,
ряд диакритик `ą ć ę ł ń ó ś ź ż`.

Захват ввода — настоящий `<input>` (`opacity-0`) поверх слотов, дельта считается в
`onChange`, а не `onKeyDown` на фокусируемом `div`: софт-клавиатура на телефоне открывается
только по фокусу редактируемого поля, а Android-IME отдаёт `keydown` без осмысленного `key`
во время композиции. `role="textbox"` и существующий `aria-label` сохраняются, каретка
приколота к концу поля. `autoCapitalize`/`autoCorrect`/`autoComplete="off"`/
`spellCheck={false}` унаследованы дословно.

Автозавершение (`onComplete`) вызывается из обработчика события, не из эффекта —
`react-hooks/purity`/`react-hooks/set-state-in-effect` в проекте ошибки, не warning.

Оформление ячеек — в одном визуальном языке с `AnswerDiff.tsx`'s `KIND_CLASS`, NFR-11 (цвет
не единственный признак): `wrong` — жирная + сплошное подчёркивание, `corrected`/`hinted` —
пунктирное, `revealed` — курсив + пунктир. Ширина слота уменьшается с ростом длины слова
(критерий приёмки MVP №14 — 320px).

**Изменено задачей 36** (`36-practice-screen-restructure.md` §5, FR-151): `revealed` больше
не курсив и не приглушённый цвет — по прямому запросу пользователя раскрытое «Показать слово»
слово рисуется тем же цветом текста и тем же начертанием, что обычный ответ; единственный
оставшийся неcветовой признак — пунктирное подчёркивание, которого и требует NFR-11.

## 5. Что удаляется

- `InputExercise.tsx`/`FormInputExercise.tsx`: собственное `useState(value)`, `insertChar`,
  `<form onSubmit>`, кнопка **«Проверить»**, блок статуса «Верно / Почти верно / Неверно» у
  поля — усыхают до «промпт + `LetterSlotsInput`».
- `ExerciseFeedback`: проп `answerGiven` удалён, добавлен `attempt?: TypedAttemptOutcome`.
  Новый статус **`assisted`** («Верно, но с подсказкой» — при `feedback.correct` и
  `mistakes > 0 || hintsUsed > 0`). «Глазок» показывает обычную строку «Правильный ответ» —
  слоты уже раскрыли слово, дифф был бы избыточен.
- `components/app/AnswerDiff.tsx`: удалена **только `AnswerDiffLines`** — у неё не осталось
  потребителей. `DiffText`/`ExpectedDiffLine`/весь `answer-diff.ts`/`GradeResult.closest`
  остаются — их держат ячейки таблиц склонения/спряжения и список ошибок на экране
  результатов (FR-58, теперь сужен именно до них).
- Состояние `answerGiven` в `ActiveQuestion` (`SessionRunner.tsx`) — существовало только
  ради `AnswerDiffLines`.

## 6. E2E — `e2e/support/exercise.ts`

`answerCurrentExercise` заменяет `textbox.fill('zzz')` + «Проверить» на один клик по
**«Показать слово»** — детерминированный аналог: не требует знания польского написания,
гарантированно даёт `Неверно`. Race-условие (`radiogroup` vs текстовое поле) переведено на
`radiogroup` vs кнопку «Показать слово» — она несёт стабильный `aria-label`, в отличие от
`opacity-0`-поля. Новый хелпер `completeLetterExerciseWithHints` (клики по «Подсказка» до
автозавершения) добавлен для будущего покрытия «счастливого пути» и статуса `assisted` —
существующие сценарии его пока не используют: ни один из них не строит очередь, где
`vocab:ru-pl`/`form-input` реально появляется (свежий аккаунт получает только `choice`), а
принудить Practice-режим на `form-input` через чекбоксы «Тип задания» в e2e не входит в эту
задачу — псевдо-нативные чекбоксы `TrainingSetupScreen` не поддаются надёжному программному
клику без более глубокой доработки самого суппорт-слоя. Это осознанный пробел, см. §7.

## 7. Границы

- `letter-attempt.ts` — чистый домен: ни React, ни Dexie, ни `features/**`.
- Схема Dexie не меняется.
- Таблицы склонения/спряжения (`TableExercise`, `VerbTableExercise`) не трогаются — они
  по-прежнему проверяют ответ по blur/Enter и рендерят `ExpectedDiffLine`.
- Известный пробел: матрица путаницы (FR-104/FR-105, `confusion.repository.ts`) искала
  случаи «написал форму другого падежа», сравнивая `answerGiven` неверных логов — при
  побуквенном вводе набрать чужую форму целиком физически нельзя (курсор стоит на первой же
  чужой букве), источник данных для нового анализа остаются только ячейки таблиц.
- Известный пробел: слово, отвеченное с подсказкой (`rating: Hard`), не попадает в список
  ошибок и в «Разобрать ошибки» — `build-session-summary.ts` фильтрует по `!log.correct`.
  Внутрисессионный реквей это закрывает, межсессионный — нет; расширение фильтра до
  `rating === HARD` тянет за собой `MistakeEntry`/`SessionResultPage` и их тесты — отдельная
  задача.
- Известный пробел: e2e-покрытие «счастливого пути» (автозавершение, статус `assisted`)
  ограничено component-тестами `LetterSlotsInput.test.tsx` — см. §6.

---

## Acceptance

- [ ] `createLetterAttempt`/`typeLetter` строят одну ячейку на букву; верная буква красит
      зелёным и двигает курсор, неверная красит красным и курсор не двигает; следующее
      верное нажатие заменяет неверную букву, а не добавляется после неё
- [ ] Несколько допустимых написаний одной формы равной длины (`aborcji`/`aborcyj`) оба
      доходят до `complete` без единой ошибки
- [ ] `revealCurrentLetter` открывает ровно одну букву; `revealAll` раскрывает слово целиком
      и немедленно завершает попытку с рейтингом `Again`
- [ ] Ошибка или подсказка при верно завершённом наборе даёт рейтинг `Hard`, а не `Again`,
      и не продвигает слово к статусу «выучено» (`deriveStatus`)
- [ ] `InputExercise`/`FormInputExercise` не содержат кнопки «Проверить»; последняя верная
      буква завершает задание автоматически
- [ ] Панель `ExerciseFeedback` показывает статус «Верно, но с подсказкой» для завершённой с
      ошибкой/подсказкой попытки и не рендерит собственный побуквенный дифф для `input`/
      `form-input`
- [ ] `npm test`, `npm run lint`, `npm run build`, `npx playwright test` проходят
