# 48 — Перенос прогресса на новые `wordId`

**Зависит от:** 46, 47
**Результат:** после обновления на словарь v2 у пользователя не пропадает ни одна запись прогресса
по словам, чей `wordId` изменился: навыки, логи ответов и счётчики переезжают на новый `wordId`;
два старых слова, слитые в одно, дают одно слово с лучшим из двух прогрессов. То же преобразование
применяется к импорту бэкапа, сделанного до обновления.

---

## Зачем

Прогресс ключён по `wordId = "<lemma>|<POS>"` (`skill-id.ts`): `skills.skillId`, `skills.wordId`,
`reviewLogs.skillId`, `reviewLogs.wordId`, `wordProgress.wordId`. В v2 у 37 слов `wordId` другой
(`data/word-id-renames.json`, задача 46). Без миграции их навыки становятся сиротами: слово в
индексе не найдено → `requireEntry` бросает, или запись молча игнорируется, а слово снова
выглядит новым.

Все остальные 7949 слов сохранили `wordId` — их прогресс не трогаем вообще. Уровень у них мог
поменяться, но уровень — свойство контента, а не прогресса: он берётся из индекса при каждом
расчёте (задача 49).

## 1. `src/db/word-id-migration.ts` (чистый модуль, по образцу `legacy-vocab-migration.ts`)

Карта переименований импортируется из `data/word-id-renames.json` (JSON-импорт Vite, ~2 KB).

```ts
export function migrateSkillsForRenames(
  skills: readonly SkillRecord[],          // все навыки, затронутые картой (старые wordId) + уже существующие у целевых wordId
  renames: Readonly<Record<WordId, WordId>>,
  hasDimension: (wordId: WordId, dimension: Dimension) => boolean,
): { put: SkillRecord[]; delete: SkillId[]; dropped: SkillRecord[] }

export function migrateReviewLog(log: ReviewLogRecord, renames): ReviewLogRecord
```

Правила для навыка со старым `wordId`:

1. Новый `skillId = encodeSkillId(renames[wordId], dimension)`, `wordId` — новый.
2. **Измерения, которых у нового слова нет**, отбрасываются (попадают в `dropped`, в лог консоли с
   количеством). Это грамматика бывших «существительных» `co`, `to`, `kto`, `nic`, `wszystko` и т.п.
   (стали `PRON`, парадигмы нет, задача 47 §3) и `piast|NOUN` (у `piasta` парадигмы нет). Vocab-навыки
   (`vocab:*`) есть у любого слова и сохраняются всегда. Для возвратных глаголов измерения те же
   (парадигма через псевдоним) — переезжают полностью.
3. **Слияние** (новый `skillId` уже существует — пять слитых пар и `niektóry`, задача 46): остаётся
   навык с бóльшим прогрессом. Порядок сравнения: `state !== 'new'` > больше `reps` > позже
   `lastReviewAt`. Счётчики `correct`/`incorrect` складываются, `correctStreak` — от выбранного.
   FSRS-поля (`stability`, `difficulty`, `due`, `state`, `lapses`) берутся целиком от выбранного,
   не смешиваются.
4. Логи: `skillId`/`wordId` переписываются по той же карте. Логи отброшенных измерений
   **сохраняются** со старым `skillId` — это история, статистика по дням и точности на них
   опирается; `confusion.repository` уже пропускает логи, чей `wordId` отсутствует в индексе.

Модуль идемпотентен: ни один ключ карты не является новым `wordId` (проверено в задаче 46), так
что повторный прогон ничего не находит.

## 2. Где запускается

`hasDimension` нуждается в парадигме нового слова, а значит — в загруженном индексе. Dexie
`upgrade` выполняется до `ContentProvider`, поэтому, как в задаче 37 (`StartupMigrations.tsx`):

- **Без** новой версии схемы Dexie — индексы не меняются.
- `StartupMigrations.tsx`: новый шаг `runOnce('word-id-renames-v2', …)` в одной транзакции
  `rw` по `skills` и `reviewLogs`: выборка `skills.where('wordId').anyOf(Object.keys(renames))` плюс
  уже существующие навыки целевых `wordId` → `migrateSkillsForRenames` → `bulkDelete` + `bulkPut`;
  `reviewLogs.where('wordId').anyOf(…).modify(…)`. После — `recomputeAll()` (кэш `wordProgress`
  перестраивается целиком, старые строки `wordProgress` с исчезнувшими `wordId` удаляются
  тем же проходом).
- Шаг стоит **раньше** любого кода, который читает навыки через индекс (тот же порядок, что
  у пересчёта задачи 37).

## 3. Импорт бэкапа

`backup.repository.ts#applyImport`: после `migrateLegacySkills` прогнать навыки и логи через
`word-id-migration.ts` (для бэкапа текущей версии — no-op). `CURRENT_BACKUP_SCHEMA_VERSION` не
меняется: формат файла тот же, меняется только словарь ключей. `prepareImport` в сводке показывает
«Перенесено на новые слова: N навыков, отброшено: M» если N + M > 0.

Найти прочие хранилища `wordId` перед реализацией: `ripwire . --uses=WordId` — в частности,
настройки (`lastPracticeConfig`, `practiceScreenState`) и `sessions`, если они содержат списки
слов. Найденное мигрировать тем же модулем.

---

## Реализация — где отступает от текста выше

- **Бэкап:** перенос идёт в `prepareImport` (сразу после `migrateLegacySkills`, которая на самом
  деле живёт там, а не в `applyImport`); `prepareImport` стал `async` — `hasDimension` грузит
  парадигмы целевых слов. `applyImport` получает уже нормализованные данные. Сводка:
  `ImportSummary.renamedSkillsCount` / `droppedRenamedSkillsCount`, строка в `ImportControl`.
- **Логи:** `migrateReviewLog(log, renames)` — ровно сигнатура §1 (только перенос ключей);
  правило «логи отброшенных измерений остаются со старыми `skillId`/`wordId`» — в
  `migrateReviewLogsForRenames(logs, renames, hasDimension)`, общей для шага и бэкапа. Решение
  принимается по `hasDimension`, а не по списку `dropped`: лог может жить без навыка
  (`resetWord` удаляет навыки, логи оставляет).
- **Чтение в шаге:** `where('wordId').equals(id).toArray()` по каждому старому/целевому id и
  `bulkPut` переписанных логов вместо `anyOf(…)` / `.modify(…)` — без курсоров IndexedDB
  (сбой курсоров WebKit, см. шапку `recomputeAll`). Размерности грузятся до транзакции
  (`fetch` шардов нельзя держать внутри неё), сама транзакция `rw` по `skills` + `reviewLogs`
  перечитывает строки и пишет.
- **`StartupMigrations.tsx`:** шаги — массив `STARTUP_MIGRATIONS`, выполняются по очереди, шаг
  задачи 48 первым (пересчёты задач 28/37 бросают на неизвестном индексу `wordId`); шаг
  задачи 49 дописывается в конец массива.

## Acceptance

- [x] Тест на fake-indexeddb: навыки `spocić|VERB::verb:…` и `vocab:*` → после миграции те же FSRS-поля
      у `spocić się|VERB::…`, старых записей нет (`src/db/repositories/word-id-renames.repository.test.ts`;
      чистый модуль — `src/db/word-id-migration.test.ts`)
- [x] `to|NOUN::noun:sg:genitive` отброшен, `to|NOUN::vocab:pl-ru` → `to|PRON::vocab:pl-ru`
- [x] Слияние: `dziś|NOUN` (review, reps 5) + `dziś|ADV` (new) → у `dziś|ADV` state review, reps 5,
      `correct` = сумма
- [x] Логи переписаны; логи отброшенных измерений на месте
- [x] Повторный запуск миграции не меняет БД (тест идемпотентности)
- [x] Импорт бэкапа, снятого на v1, даёт то же состояние, что и миграция «на месте»
- [ ] `/words`, `/stats`, главная открываются без ошибок в консоли на БД с прогрессом v1
      (живая проверка на `preview` с подложенной БД — за основной сессией)
- [x] `npm test`, `npm run lint`, `npx tsc -b` проходят
