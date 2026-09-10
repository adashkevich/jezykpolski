# 37 — Трёхэтапная прогрессия перевода

**Зависит от:** 05, 09, 11, 13, 19, 24, 28
**Результат:** между «выбрать перевод из списка» и «написать слово по-польски» появляется
средний этап — узнать польское слово среди вариантов (то же упражнение выбора, только
наоборот). Оба перехода между этапами держатся на накопленной стабильности FSRS, а не на
одном ответе, как было в задаче 28. Статус `known`/`mastered` требует, чтобы слово было
набрано успешно хотя бы раз, а не просто чтобы навык написания существовал. Первая реальная
миграция БД (`version(2)`) переносит существующий прогресс на новую модель без потерь.

---

## Требования: FR-80, FR-81, FR-83, FR-153, FR-154 (переопределяют формулировки задачи 28)

## Зачем

Задача 28 ввела два этапа перевода: `vocab:pl-ru` (выбор перевода) → `vocab:ru-pl` (написание
по-польски). Переход держался на состоянии FSRS: `learning_steps: ['10m']` графадуирует навык
в `review` с первого же верного ответа, а значит этап 2 открывался буквально после одного
клика — с recognition сразу на free recall, минуя cued recall.

Разведка перед задачей показала, что второе упражнение уже полностью готово и просто
недостижимо: `generate.ts#buildVocabChoice` не привязан к направлению жёстко — для `ru-pl` он
меняет местами промпт/ответ и берёт польские дистракторы через тот же
`pickVocabDistractors`. Не хватало только навыка, который довёл бы до него планировщик.

---

## 1. Три навыка вместо двух

`vocab:ru-pl` переименован в `vocab:ru-pl-input`, добавлен `vocab:ru-pl-choice`:

| Навык | Упражнение | Открывается |
|---|---|---|
| `vocab:pl-ru` | `choice`, PL→RU | при первом показе нового слова |
| `vocab:ru-pl-choice` | `choice`, RU→PL | `vocab:pl-ru.stability ≥ RECOGNITION_UNLOCK_STABILITY_DAYS` (7) |
| `vocab:ru-pl-input` | `input`, побуквенно | `vocab:ru-pl-choice.stability ≥ CUED_RECALL_UNLOCK_STABILITY_DAYS` (10) |

Пороги — `learning/progress/stage.ts`. Опорные числа FSRS при дефолтных весах: первый Good на
новой карте даёт stability ≈ 2.3 дня, второй (по расписанию) ≈ 6–11, третий ≈ 15–46. Порог 7
требует двух-трёх успешных повторений, порог 10 — трёх; один и тот же механизм на обе
ступени, вместо state-based правила задачи 28.

`shouldUnlockCuedRecall`/`shouldUnlockProduction` сознательно не проверяют `state` отдельно:
FSRS не обнуляет стабильность при `Again`/`Hard`, только демпфирует её, так что случайный
срыв после месяцев уверенных повторений обычно не роняет стабильность ниже порога — открыть
следующий этап на этом же ответе не ошибка, слово по-прежнему хорошо закреплено.

`learning/skills/enumerate.ts` — денаменатор `enumerateSkills` для vocab вырос с 2 до 3.

## 2. Открытие следующего этапа

`answer-pipeline.ts#unlockNextVocabStage` (было `unlockProductionStage`) — двухступенчатая
цепочка: `vocab:pl-ru` → пробует открыть `vocab:ru-pl-choice`, `vocab:ru-pl-choice` → пробует
открыть `vocab:ru-pl-input`. Тот же приём для слов, выученных до этой задачи —
`build-session-exercises.ts#materializeQueueItem`, ветка `'due'`, добирает пропущенный этап,
если стабильность уже перевалила за порог.

## 3. Гейт `known`/`mastered` ужесточён

`learning/progress/stage.ts#hasGraduatedProduction` — точный предикат под трёхнавыковой
моделью: `vocab:ru-pl-input` показывает только упражнения на печать, значит
`state === 'review'` на нём означает «слово хоть раз успешно набрано». `aggregate.ts` несёт
это в `WordAggregate.productionGraduated`; `deriveStatus` требует его явно, а не просто
`stage === 'production'` (навык может существовать, но ещё ни разу не graduate).

## 4. «Тип задания» теперь действует и на перевод

Тип vocab-упражнения жёстко привязан к измерению (`picker.ts#vocabExerciseType`), поэтому
`forceCategory` не может «переключить» его, как для морфологии. Вместо этого настройка
фильтрует, какие vocab-навыки вообще попадают в выборку:

- «только выбор» — `vocab:ru-pl-input` исключается;
- «только ввод» — `vocab:pl-ru`/`vocab:ru-pl-choice` исключаются, бюджет новых слов
  обнуляется (новое слово физически не может начаться со ввода).

Для ежедневной сессии — `session-scope.ts#filterForVocabExerciseType`, применяется к
`word`/`filter`/`global` (не к `mistake` — иначе тихо потерялась бы часть только что
допущенных ошибок; не к `skill` — точечный клик по ячейке таблицы, там vocab не бывает). Для
Practice — `build-practice-queue.ts#vocabMatchesExerciseType`, в `matchesConfig`'s vocab-ветке.
Исключённые навыки не перестают быть просроченными — они копятся; тексты в
`LearningSettingsSection.tsx`/`TrainingSetupScreen.tsx` предупреждают об этом.

## 5. Миграция БД — `version(2)`

Первая реальная миграция в проекте. `db/legacy-vocab-migration.ts` — чистые функции
переименования/бэкфилла, переиспользуются в двух местах:

1. `db/database.ts#version(2).upgrade()` — переименовывает `skills`/`reviewLogs` на реальной
   Dexie-транзакции при `db.open()`. `skillId` — первичный ключ `skills`, поэтому смена имени
   идёт через `bulkDelete` + `bulkAdd` по отфильтрованным legacy-строкам, а не через
   `Collection#modify()` (Dexie запрещает менять первичный ключ так). `reviewLogs.skillId` —
   обычное поле, там `modify()` подходит.
2. `db/repositories/backup.repository.ts#prepareImport` — та же нормализация для бэкапа,
   экспортированного до этой задачи. `CURRENT_BACKUP_SCHEMA_VERSION` НЕ бампается: формат
   файла не изменился, изменилось только значение одной строки, а это поле — `z.string()` без
   ограничения на конкретные значения.

Бэкфилл обязателен: без него у уже продвинутых слов знаменатель `vocabMaturity` вырос бы с 2
до 3, и часть слов откатилась бы из `known`/`mastered` в `learning`. Новый `vocab:ru-pl-choice`
получает точную копию SRS-состояния перенесённого `vocab:ru-pl-input` — кто уже печатает
слово, средний этап очевидно прошёл, даже если записи под него раньше не существовало.

`wordProgress` эта миграция не трогает — `computeWordProgress` требует загруженного контента,
которого при `db.open()` ещё нет. Пересчёт — отдельный `runOnce`-проход `recomputeAll()` в
`StartupMigrations.tsx`, под новым ключом `recompute-word-progress-for-three-stage-vocab`
(второй, независимый от задачи-28 ключа `recompute-word-progress-for-stage-gate`).

## Затронутые модули

Домен: `learning/skills/dimensions.ts`, `enumerate.ts`, `progress/stage.ts`, `aggregate.ts`,
`exercises/picker.ts`, `exercises/generate.ts` (только `directionOfVocabSkill`),
`srs/policy.ts` (свайп теперь пишет три навыка), `session/build-practice-queue.ts`.

Прикладной слой: `session-runner/lib/answer-pipeline.ts`, `build-session-exercises.ts`,
`session-scope.ts`, `hooks/useSessionBootstrap.ts`, `session-results/lib/dimension-group.ts`,
`db/repositories/swipe.repository.ts`.

Хранилище: `db/database.ts` (`version(2)`), `db/legacy-vocab-migration.ts` (новый),
`db/repositories/backup.repository.ts`, `components/app/StartupMigrations.tsx`.

UI-тексты: `features/settings/components/LearningSettingsSection.tsx`,
`features/training-setup/components/TrainingSetupScreen.tsx`.

## Проверка

`npm test` / `npm run lint` / `npx tsc -b` — все три чистые. Целевые новые/переписанные тесты:
`stage.test.ts`, `aggregate.test.ts`, `picker.test.ts`, `enumerate.test.ts`,
`answer-pipeline.test.ts` (реальные FSRS-интервалы между ответами, не подделанная
стабильность — `now` двигается на `skill.due` между вызовами, иначе стабильность не растёт:
FSRS не двигает её при повторном ответе в тот же день), `database.test.ts` (реальная
Dexie-миграция на предварительно засеянной version(1) базе), `legacy-vocab-migration.test.ts`,
`backup.repository.test.ts`, `build-practice-queue.test.ts`, `session-scope.test.ts`,
`swipe.repository.test.ts`, плюс поправки числовых ожиданий в местах, где денаменатор vocab
вырос с 2 до 3 (`words-progress.repository.test.ts`,
`WordDetailPage.test.tsx`, `HomePage.test.tsx`, `StatsPage.test.tsx`,
`useWordProgressSummary.test.ts`).
