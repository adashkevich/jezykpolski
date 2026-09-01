# 05 — Dexie: схема и репозитории

**Зависит от:** 03
**Результат:** IndexedDB через Dexie, типизированные репозитории, прогресс переживает перезагрузку.

---

## Шаги

### 1. `db/database.ts`

Схема — из `spec/architecture.md` §8. Ключевые моменты:

```ts
this.version(1).stores({
  skills:       'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
  wordProgress: 'wordId, status, nextDue, updatedAt',
  reviewLogs:   '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
  sessions:     '++id, mode, startedAt, endedAt',
  dailyStats:   'date',
  settings:     'key',
  meta:         'key',
});
```

Индекс `due` (число, epoch ms) обязателен: главный запрос приложения — «что повторять сейчас» —
это range-запрос, а не скан.

Составной `[kind+due]` нужен для очереди внутри раздела («повторить только существительные»).

### 2. `db/repositories/skills.repository.ts`

```ts
getSkill(skillId): Promise<SkillRecord | undefined>
getSkillsForWord(wordId): Promise<SkillRecord[]>
getDueSkills(now: number, limit: number, kind?: SkillKind): Promise<SkillRecord[]>
countDue(now: number, kind?: SkillKind): Promise<number>
countDueBetween(from: number, to: number): Promise<number>   // «завтра», «7 дней»
upsertSkill(record: SkillRecord): Promise<void>
ensureSkill(skillId, wordId, kind, dimension): Promise<SkillRecord>  // ленивая материализация
resetWord(wordId): Promise<void>
```

`ensureSkill` — точка ленивой материализации (`architecture.md` §5.2). Нигде больше навыки
не создаются.

### 3. `db/repositories/reviews.repository.ts`

```ts
logReview(entry: ReviewLogRecord): Promise<number>
getLogsForWord(wordId, limit): Promise<ReviewLogRecord[]>
getLogsForSession(sessionId): Promise<ReviewLogRecord[]>
getLogsSince(ts: number): Promise<ReviewLogRecord[]>
```

Логи **никогда не удаляются** (кроме полного сброса) — на них строится анализ ошибок (FR-104).

### 4. `db/repositories/words-progress.repository.ts`

```ts
getWordProgress(wordId): Promise<WordProgressRecord | undefined>
getAllWordProgress(): Promise<Map<WordId, WordProgressRecord>>   // для фильтра списка
recomputeWordProgress(wordId): Promise<void>                     // из skills → wordProgress
recomputeAll(): Promise<void>                                    // после импорта/миграции
```

`wordProgress` — денормализация, не второй источник правды. `recomputeAll` обязан полностью
восстанавливать её из `skills`.

### 5. Транзакционность записи ответа

Один ответ = одна транзакция `readwrite` по `skills` + `reviewLogs` + `wordProgress` + `dailyStats`.
Частично записанный ответ недопустим.

```ts
applyAnswer(input: AnswerInput): Promise<void>
```

Живёт в `db/repositories/answer.ts`, вызывает FSRS-адаптер (задача 11) и пишет всё разом.

### 6. Настройки и мета

```ts
settingsRepository.get<T>(key, fallback: T): Promise<T>
settingsRepository.set<T>(key, value: T): Promise<void>
metaRepository.getContentVersion() / setContentVersion()
```

При старте: если `contentVersion` в `meta` не совпадает с `manifest.json` — записать новую.
Прогресс **не сбрасывать**: `wordId` стабилен, привязка к контенту не ломается.

### 7. Обработка ошибок инициализации

Открытие IndexedDB может упасть (приватный режим, квота, повреждение). Это одна из
«осмысленных границ» blueprint §19: показать `ErrorState` с объяснением и кнопкой сброса БД,
а не белый экран.

### 8. Хуки

`src/hooks/useDueCount.ts`, `useWordProgress.ts` и т.п. — на `useLiveQuery`.
Компоненты **не** пишут запросы Dexie напрямую (NFR-12).

---

## Acceptance

- [ ] БД создаётся при первом запуске, версия 1
- [ ] `getDueSkills` использует индекс — проверено на 5000 синтетических записей, время < 20 мс
- [ ] `ensureSkill` идемпотентен: повторный вызов не создаёт дубль и не сбрасывает состояние
- [ ] `applyAnswer` атомарен: искусственный сбой в середине не оставляет частичной записи
- [ ] `recomputeAll` восстанавливает `wordProgress` из `skills` побитово так же, как инкрементальный пересчёт
- [ ] Данные переживают перезагрузку страницы и перезапуск браузера
- [ ] Компоненты не содержат прямых обращений к `db.table(...)` (проверить grep'ом / ESLint-правилом)
- [ ] Ошибка открытия БД показывает `ErrorState`, а не падает
