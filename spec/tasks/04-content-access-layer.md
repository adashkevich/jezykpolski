# 04 — Слой доступа к контенту

**Зависит от:** 02, 03
**Результат:** `src/content/**` умеет отдавать слова, значения и парадигмы; поиск и фильтрация по 7998 словам работают быстро.

---

## Шаги

### 1. `content/loader.ts`

```ts
loadManifest(): Promise<ContentManifest>
loadIndex(): Promise<WordIndexEntry[]>
loadSensesShard(n: number): Promise<Map<WordId, Sense[]>>
loadParadigmShard(n: number): Promise<Map<WordId, Paradigm>>
```

- `manifest.json` валидируется Zod; остальное — нет (бюджет производительности).
- Каждый шард загружается **один раз** и держится в памяти (`Map<number, Promise<…>>`),
  параллельные запросы к одному шарду дедуплицируются.
- HTTP-кэширование — забота service worker (задача 25), loader про него не знает.

### 2. `content/index-store.ts`

Индекс в памяти, строится один раз при старте:

```ts
byId: Map<WordId, WordIndexEntry>
byRank: WordIndexEntry[]              // уже отсортирован пайплайном
byAlpha: WordIndexEntry[]             // локаль 'pl', учитывает ą ć ę ł ń ó ś ź ż
byPos: Map<Pos, WordIndexEntry[]>
```

Сортировка по алфавиту — **`Intl.Collator('pl')`**, не `String.prototype.localeCompare` по умолчанию:
иначе `ą` встанет после `z`.

### 3. `content/query.ts` — фильтрация и поиск

```ts
interface WordQuery {
  levels?: Level[];          // множественный выбор
  upToLevel?: Level;         // «до уровня B1» = A1+A2+B1
  pos?: Pos[];
  status?: WordStatus[];     // требует прогресс, передаётся снаружи
  topN?: 500 | 1000 | 2000 | 5000 | null;
  search?: string;
  sort: 'frequency' | 'level' | 'alphabetical';
}

queryWords(q: WordQuery, progress: Map<WordId, WordProgressRecord>): WordIndexEntry[]
```

Требования к производительности (7998 записей, вызывается на каждое изменение фильтра):

- никаких промежуточных аллокаций на строку — один проход с предикатом;
- предвычисленные отсортированные массивы вместо `sort()` на каждый запрос;
- поиск по подстроке нормализует польские диакритики **в запросе и в индексе одинаково**,
  чтобы `zolty` находил `żółty` (в поиске — да, при проверке ответа — нет, см. задачу 09);
- поиск идёт и по лемме, и по русскому переводу из `index.json`;
- результат мемоизируется по сериализованному ключу запроса.

### 4. `content/paradigms.ts`

```ts
getParadigm(wordId: WordId): Promise<Paradigm | null>
getFormsForSlot(paradigm: Paradigm, dimension: Dimension): string[]
buildNounTable(paradigm): NounTable        // case × number
buildVerbTable(paradigm): VerbTable        // tense/mood × person × number (+gender для past)
buildAdjTable(paradigm, number): AdjTable  // case × gender
```

Декодирование числовых кодов в типизированные значения — через `codec.ts`, синхронизированный
с `manifest.json`. Если версии кодека разошлись — бросить понятную ошибку, а не молча
показать неверный падеж.

### 5. `content/senses.ts`

```ts
getSenses(wordId: WordId): Promise<Sense[]>
getPrimaryTranslation(wordId): string        // из index, без загрузки шарда
getAllTranslations(wordId): Promise<string[]> // для проверки ответа и дистракторов
```

### 6. Загрузочный экран

Пока `index.json` не загружен, приложение показывает `LoadingScreen`. Ошибка загрузки → `ErrorState`
с кнопкой повтора. Провайдер — `ContentProvider` в `app/providers/`, отдаёт готовый index через контекст.

---

## Acceptance

- [ ] Загрузка индекса на холодном старте < 300 мс на среднем устройстве
- [ ] `queryWords` со всеми фильтрами отрабатывает < 16 мс (замерить тестом)
- [ ] Сортировка по алфавиту ставит `ą` после `a`, а не после `z`
- [ ] Поиск `zolty` находит `żółty`; поиск `человек` находит `człowiek`
- [ ] Фильтр «до уровня B1» возвращает ровно A1+A2+B1 = 3903 слова
- [ ] `getParadigm` для одного из 14 слов без парадигмы возвращает `null`, не бросает
- [ ] Повторный `getParadigm` для слова из уже загруженного шарда не делает сетевой запрос
- [ ] Два параллельных запроса к одному шарду порождают один fetch
- [ ] `buildNounTable` для `kobieta` даёт 7 падежей × 2 числа с корректными формами
- [ ] Тесты на декодирование кодека при расхождении версий
