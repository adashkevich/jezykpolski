# 28 — Два этапа изучения слова и побуквенная проверка написания

**Зависит от:** 09, 11, 12, 13
**Результат:** выбор значения из списка становится ровно первым этапом изучения слова, вторым
— написание с русского на польский; проверка любого набранного ответа во всём приложении
показывает совпавшие буквы зелёным, а ошибочные красным.

---

## Требования: FR-50, FR-53, FR-58, FR-80, FR-81, FR-83 (FR-51 и FR-52 отменяются)

## Зачем

До этой задачи `vocab:ru-pl` **не материализовался нигде** в ежедневном Learn:
`build-session-exercises.ts#materializeQueueItem` создавал новому слову только `vocab:pl-ru`,
а `buildLearnQueue` берёт кандидатов из существующих записей `skills`. Реальная прогрессия
получалась «выбери перевод из списка → напечатай перевод **по-русски**»: польское написание
не тренировалось вообще, а слово при этом добиралось до статуса `known`.

Второе: `grade` считал подсветку отличий только для near-miss (ответ совпал после снятия
диакритик), и подсвечивались лишь буквы с диакритикой. На любой другой ошибке пользователь
видел «Неверно» и правильный ответ целиком, без указания, где именно ошибся.

---

## 1. `learning/exercises/picker.ts` — направление вместо состояния

Для `kind === 'vocab'` тип упражнения определяется измерением, а не FSRS-состоянием:

| Навык | Тип | Этап |
|---|---|---|
| `vocab:pl-ru` | `choice` — во всех состояниях | 1, узнавание |
| `vocab:ru-pl` | `input` — во всех состояниях (`self-assess` только при явной настройке в `review`) | 2, воспроизведение |

Морфология не трогается: там остаётся switch по `state`/`reps` и подстановка
`context-sentence` из задачи 27.

`PickerOptions.forceCategory` («Тип задания» в Practice и в настройках) применяется только к
морфологии — у перевода выбирать нечего, а `forceCategory: 'recall'` на `vocab:pl-ru`
воскресил бы отменённый FR-52. Обе точки настройки получают подпись «Влияет на формы слов».

## 2. `learning/progress/stage.ts` — когда открывается этап 2

Новый чистый модуль:

```ts
export type LearningStage = 'not-started' | 'recognition' | 'production'
export function shouldUnlockProduction(recognition: SkillRecord | undefined): boolean
export function stageOf(skills: readonly SkillRecord[]): LearningStage
```

Условие открытия — `recognition.state === 'review'`. С `learning_steps: ['10m']`
(`learning/srs/fsrs-adapter.ts`) первый же верный `choice` даёт рейтинг `Good` и графадуирует
навык: это и есть «этап 1 засчитан». Ошибка или «трудно» оставляют навык в
`learning`/`relearning`, и этап 2 ждёт.

Точки вызова:

1. `features/session-runner/lib/answer-pipeline.ts#unlockProductionStage` — основная. После
   расчёта `dampedNext`, но **до** `getSkillsForWord`/`computeWordProgress`, чтобы свежая
   запись попала в тот же пересчёт прогресса. Требует `srsApplied` (в режиме `mistakes` SRS
   не двигается вообще, FR-103; Practice двигает, только демпфированно, — там этап 2
   открывается так же, как в Learn). `ensureSkill` идемпотентен, `due = now`.
2. `features/session-runner/lib/build-session-exercises.ts#materializeQueueItem`, ветка
   `'due'` — добор для слов, выученных до этой задачи: они никогда не проходили через
   промоушен на ответе и иначе остались бы на этапе 1 навсегда.

FR-81 («не за одну сессию») выполняется структурно: очередь сессии строится целиком заранее,
поэтому навык, созданный во время ответа, попадёт самое раннее в следующую сессию.

## 3. `learning/exercises/answer-diff.ts` — побуквенное сравнение

```ts
export function diffAnswer(typed: string, expected: string): AnswerDiff
export function pickClosestExpected(typed: string, candidates: readonly string[]): string
```

- нормализация символа: регистр + `ё → е`; пробелы схлопываются тем же
  `collapseWhitespace`, что использует `grade` (функция вынесена сюда и переиспользуется);
- диакритики **не** сворачиваются: `o` против `ó` — красная буква, это и тренируется;
- выравнивание — Левенштейн с восстановлением пути. Позиционное сравнение при одной
  пропущенной букве красит весь хвост слова и перестаёт показывать, где ошибка;
- `pickClosestExpected` нужен там, где принятых ответов несколько.

`grade.ts`: `DiffHint`/`diacriticIndexes` удаляются, вместо них `GradeResult.closest` —
ближайший принятый вариант, заполняется для `input`/`form-input`. Сам дифф `grade` не считает:
им пользуется и экран результатов, у которого есть только две строки из `reviewLogs`.

## 4. `components/app/AnswerDiff.tsx` — единственный рендерер

`DiffText` (одна строка), `AnswerDiffLines` (обе строки: «Ты написал» + «Правильно»),
`ExpectedDiffLine` (компактный вариант для ячеек таблиц). Живёт в `components/app/**`, а не
внутри `features/session-runner/**`, потому что пользователей два разных раздела.

Цвета — существующие токены `--success`/`--error` (`app/styles/globals.css`), уже выверенные
под WCAG AA в обеих темах; новых токенов не заводится. NFR-11: ошибочная буква подчёркнута,
лишняя зачёркнута, пропущенная подчёркнута пунктиром, а весь раскрашенный ряд помечен
`aria-hidden` рядом с `sr-only`-строкой обычного текста.

Точки применения: `InputExercise`, `FormInputExercise`, `ExerciseFeedback`, `TableExercise`,
`VerbTableExercise`, `SessionResultPage` (список ошибок). `diff-highlight.tsx` удаляется.

## 5. `learning/progress/aggregate.ts` — гейт статуса

`WordAggregate` получает `stage`; `deriveStatus` не поднимает слово выше `learning`, пока
`stage !== 'production'`. Кэш `wordProgress.status` у существующих пользователей
пересчитывается один раз на старте — `meta.repository.ts#runOnce` +
`words-progress.repository.ts#recomputeAll`, вызов в `DatabaseProvider`.

## 6. Границы

- `answer-diff.ts` и `stage.ts` — чистый домен: ни React, ни Dexie, ни `features/**`
  (`eslint.config.js`).
- Морфологическая часть `picker.ts` не меняется.
- Схема Dexie не меняется: этап выражен наличием записи навыка, а не новым полем.
- `buildVocabInput`/`buildVocabChoice` остаются симметричными по направлению; недостижимые
  теперь ветки помечены комментарием, а не удалены.

---

## Acceptance

- [ ] `pickExerciseType` возвращает `choice` для `vocab:pl-ru` во всех четырёх состояниях и
      при `forceCategory: 'recall'`, и `input` для `vocab:ru-pl`
- [ ] Верный ответ на `choice` по `vocab:pl-ru` создаёт запись `vocab:ru-pl`; неверный — нет;
      в режиме `mistakes` — нет; повторный ответ не пересоздаёт запись
- [ ] Слово с одним зрелым `vocab:pl-ru` имеет статус `learning`, а не `known`
- [ ] `diffAnswer` без учёта регистра; пропуск и лишняя буква дают ровно одну отметку, а не
      покрашенный хвост; `zolty` против `żółty` даёт три красные буквы
- [ ] Побуквенное сравнение видно в упражнении на ввод, в панели фидбека, в ячейках обеих
      таблиц и в списке ошибок на экране результатов
- [ ] `npm test`, `npm run lint`, `npm run build`, `npx playwright test` проходят; axe не
      находит нарушений контраста на экране сессии с показанным диффом в обеих темах
