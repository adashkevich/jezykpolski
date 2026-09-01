# Архитектура — Polish Learning PWA

> Baseline-документ архитектуры. Читается вместе с `spec/requirements.md`.
> Дата: 2026-09-01

---

## 1. Ключевой принцип

> **Минимальная единица обучения — не слово, а навык (skill), связанный со словом.**

`kobieta` — это не одна карточка, а набор навыков:

```text
kobieta|NOUN::vocab:pl-ru          kobieta → женщина
kobieta|NOUN::vocab:ru-pl          женщина → kobieta
kobieta|NOUN::noun:sg:genitive     kobieta → kobiety
kobieta|NOUN::noun:sg:dative       kobieta → kobiecie
kobieta|NOUN::noun:pl:instrumental kobieta → kobietami
...
```

Из этого следует всё остальное: схема БД, модель прогресса, SRS, статистика.

---

## 2. Слои системы

```text
┌─────────────────────────────────────────────────────────┐
│                     UI (React 19)                       │
│   pages/  ·  features/*/components  ·  components/ui    │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
       ┌────────▼────────┐       ┌────────▼─────────┐
       │  Zustand        │       │  dexie-react-    │
       │  session/UI     │       │  hooks           │
       │  (эфемерное)    │       │  useLiveQuery    │
       └────────┬────────┘       └────────┬─────────┘
                │                         │
    ┌───────────▼─────────────────────────▼───────────────┐
    │                    ДОМЕН                            │
    │  content/   (иммутабельный контент, запросы)        │
    │  learning/  (skills, exercises, distractors, srs)   │
    │  db/repositories/ (типизированный доступ к Dexie)   │
    └───────────┬─────────────────────────┬───────────────┘
                │                         │
      ┌─────────▼──────────┐     ┌────────▼─────────┐
      │  Cache Storage     │     │    IndexedDB     │
      │  /content/*.json   │     │   (Dexie)        │
      │  через Workbox     │     │  прогресс, логи  │
      └────────────────────┘     └──────────────────┘
```

### Источники правды

| Данные | Где живут | Мутируются? |
|---|---|---|
| Слова, переводы, парадигмы форм | `public/content/**`, порождены из `data/**` | Никогда |
| Прогресс, FSRS-карточки, логи ответов, настройки, статистика | IndexedDB (Dexie) | Да |
| Текущий вопрос, выбранный ответ, открытые фильтры, диалоги | React state / Zustand | Да, эфемерно |

Записи Dexie **не дублируются** в глобальный Zustand-стор. Реактивность к БД — только через `useLiveQuery`.

---

## 3. Структура каталогов

```text
scripts/
└── build-content.ts            # build-time пайплайн data/ → public/content/

data/                           # СЫРЫЕ авторские данные, не деплоятся
├── words.json                  # 5.6 МБ
└── inflections.json            # 29 МБ

public/content/                 # ПОРОЖДЁННЫЕ артефакты, деплоятся
├── manifest.json               # версия контента + карта шардов
├── index.json                  # компактный индекс всех 7998 слов (~112 КБ gz)
├── senses/000.json … 015.json  # полные значения, 16 шардов (~24 КБ gz каждый)
└── paradigms/000.json … 063.json  # формы, 64 шарда (~15 КБ gz каждый)

src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── providers/AppProviders.tsx
│   └── styles/globals.css        # Tailwind v4 + design tokens
│
├── pages/
│   ├── home/HomePage.tsx
│   ├── words/WordsListPage.tsx
│   ├── words/WordDetailPage.tsx
│   ├── nouns/…  verbs/…  adjectives/…
│   ├── session/SessionPage.tsx          # общий runner для Learn и Practice
│   ├── session/SessionResultPage.tsx
│   ├── practice/PracticeSetupPage.tsx
│   ├── stats/StatsPage.tsx
│   └── settings/SettingsPage.tsx
│
├── content/                      # доступ к иммутабельному контенту
│   ├── loader.ts                 # fetch + кэш шардов в памяти
│   ├── index-store.ts            # индекс слов в памяти, поиск/фильтр/сортировка
│   ├── paradigms.ts              # получение парадигмы по wordId
│   ├── codec.ts                  # распаковка компактного формата
│   └── content.schema.ts         # Zod-схемы артефактов
│
├── learning/                     # ЧИСТЫЙ домен, без React
│   ├── skills/
│   │   ├── skill-id.ts           # кодирование/декодирование skillId
│   │   ├── dimensions.ts         # перечни падежей, времён, родов, их порядок и подписи
│   │   └── enumerate.ts          # какие навыки существуют у слова
│   ├── srs/
│   │   ├── fsrs-adapter.ts       # ЕДИНСТВЕННОЕ место импорта ts-fsrs
│   │   └── srs.types.ts
│   ├── exercises/
│   │   ├── exercise.types.ts     # discriminated union
│   │   ├── generate.ts           # skill + контент → Exercise
│   │   ├── picker.ts             # какой тип упражнения показать для навыка
│   │   ├── distractors.ts
│   │   └── grade.ts              # нормализация и проверка ответа
│   ├── session/
│   │   ├── build-learn-queue.ts
│   │   ├── build-practice-queue.ts
│   │   └── session.types.ts
│   └── progress/
│       └── aggregate.ts          # навыки → проценты по слову/падежу/уровню
│
├── db/
│   ├── database.ts
│   ├── schema.ts
│   └── repositories/
│       ├── skills.repository.ts
│       ├── words-progress.repository.ts
│       ├── reviews.repository.ts
│       ├── sessions.repository.ts
│       ├── settings.repository.ts
│       └── stats.repository.ts
│
├── features/
│   ├── words-list/{components,hooks}
│   ├── word-detail/{components}
│   ├── session-runner/{components,hooks}
│   ├── paradigm-table/{components}
│   ├── training-setup/{components}
│   └── stats/{components}
│
├── components/
│   ├── ui/                       # shadcn, добавляется по мере надобности
│   └── app/                      # AppShell, BottomNav, PageContainer, EmptyState…
│
├── stores/
│   ├── session.store.ts
│   └── filters.store.ts
│
├── lib/  hooks/  types/
├── main.tsx
└── vite-env.d.ts
```

Правило: `learning/**` не импортирует React и не импортирует Dexie. Это чистые функции,
которые тестируются Vitest без DOM.

---

## 4. Контентный пайплайн

### 4.1 Проблема

`data/inflections.json` — 29 МБ (1.40 МБ gz), 195 487 форм. Бандлить или держать в памяти нельзя.
`data/words.json` — 5.6 МБ, но 80% объёма — частотная статистика, ненужная в рантайме.

### 4.2 Решение

Build-time скрипт `scripts/build-content.ts` (запускается в `prebuild` и вручную) читает `data/**`
и порождает `public/content/**`. Замеренные размеры:

| Артефакт | Raw | Gzip | Стратегия кэша |
|---|---|---|---|
| `index.json` | 389 КБ | **112 КБ** | Precache |
| `senses/*.json` (16 шардов) | 1.1 МБ | **376 КБ** | Precache (или lazy при жёстком бюджете) |
| `paradigms/*.json` (64 шарда) | 13.8 МБ | **0.92 МБ** | Runtime cache, CacheFirst, по требованию |

Компактизация парадигм: удаляется `raw_tag`, значения измерений интернируются в числовые коды,
форма кодируется массивом фиксированной длины вместо объекта → 29 МБ → 13.8 МБ raw.
`raw_tag` сохраняется в отдельном dev-артефакте для отладки, в прод не идёт.

### 4.3 Формат `index.json`

Массив кортежей — минимум байт, декодируется один раз при старте:

```ts
// [lemma, posCode, rank, levelCode, primaryTranslationRu, sensesShard, paradigmShard]
type IndexRow = [string, number, number, number, string, number, number];
```

7998 строк → распаковываются в типизированные объекты `WordIndexEntry` в памяти (~3 МБ heap,
приемлемо) и индексируются для поиска: `Map<wordId, entry>`, отсортированные по rank/алфавиту
массивы, префиксные индексы для поиска.

### 4.4 Шардирование

`shard = hash(wordId) % N` — детерминированный, стабильный между сборками. Открытие любого слова
тянет ровно один шард парадигм (~15 КБ gz). Настройка «Скачать всё для офлайна» префетчит все 64.

### 4.5 Версионирование контента

`manifest.json` содержит `contentVersion` (хэш от `data/**`). Значение пишется в таблицу `meta`.
При смене версии инвалидируются кэши шардов; **прогресс не трогается**, потому что `wordId`
(`lemma|POS`) стабилен и не зависит от порядка в файле (NFR-14).

### 4.6 Валидация

Zod-схемы валидируют артефакты **в build-скрипте** (fail fast при генерации) и **точечно в рантайме**
только для `manifest.json`. Валидировать 195k форм в рантайме на мобильном — недопустимо по бюджету.

---

## 5. Модель навыка

### 5.1 Идентификатор

```text
skillId = "<wordId>::<dimension>"
wordId  = "<lemma>|<POS>"            например  "kobieta|NOUN"
```

Пространство измерений:

```text
vocab:pl-ru
vocab:ru-pl

noun:<number>:<case>                 noun:sg:genitive
verb:<tense>:<person>:<number>       verb:present:1:sg
verb:past:<person>:<number>:<gender> verb:past:1:sg:masculine
verb:imperative:<person>:<number>    verb:imperative:2:sg
adj:<number>:<gender>:<case>         adj:sg:feminine:genitive
adj:degree:<degree>                  adj:degree:comparative
adv:degree:<degree>
```

`skillId` — строка, потому что она читается в логах и в экспорте, и позволяет запрашивать
по префиксу без дополнительных индексов.

### 5.2 Ленивая материализация — критично

Наивный подход создаёт запись на каждую возможную форму: **195 487 навыков + 16 000 vocab** —
неприемлемо ни по объёму, ни по скорости первичной инициализации.

Правило: **запись в таблице `skills` создаётся только в момент первого показа этого навыка
пользователю.** Множество «всех возможных навыков» — вычисляемое, из контента; множество
«известных системе навыков» — то, что реально лежит в БД.

Отсюда важное следствие для расчёта процентов: знаменатель берётся из контента
(«сколько всего слотов у этого слова»), числитель — из БД. Отсутствие записи = статус `new`.

### 5.3 Записи

```ts
type SkillKind = 'vocab' | 'noun' | 'verb' | 'adj' | 'adv';

interface SkillRecord {
  skillId: string;          // PK
  wordId: string;
  kind: SkillKind;
  dimension: string;        // часть skillId после "::"

  // FSRS-состояние (см. §6)
  state: 'new' | 'learning' | 'review' | 'relearning';
  stability: number;
  difficulty: number;
  due: number;              // epoch ms — число, чтобы индексировать диапазоном
  lastReviewAt?: number;
  reps: number;
  lapses: number;

  // прикладная статистика
  correct: number;
  incorrect: number;
  createdAt: number;
  updatedAt: number;
}
```

### 5.4 Агрегация (вычисляемая, не хранимая)

`learning/progress/aggregate.ts` считает из набора навыков:

```text
kobieta|NOUN
  Значение         96%   ← среднее по vocab:pl-ru, vocab:ru-pl
  Склонение        64%   ← по всем noun:*, знаменатель = число слотов в парадигме
    Singular       88%
    Plural         42%
  Общее владение   72%   ← взвешенное
```

Формула «зрелости» одного навыка выводится из FSRS `stability`, а не из счётчика правильных
ответов: `maturity = clamp(stability / TARGET_STABILITY_DAYS, 0, 1)`, где `TARGET_STABILITY_DAYS`
задаёт порог «освоено» (по умолчанию 60 дней). Это даёт непрерывную величину вместо бинарного
флага (требование app-design §30).

Статусы UI — производные пороги:

```text
new       нет ни одной записи навыка
learning  есть записи, но vocabMaturity < 0.35
known     vocabMaturity ≥ 0.35
mastered  vocabMaturity ≥ 0.9 И morphologyMaturity ≥ 0.9 (для слов с парадигмой)
```

### 5.5 Денормализация для списков

Считать агрегат на лету для 7998 строк списка при каждом рендере нельзя. Поэтому таблица
`wordProgress` — **кэш производных значений**, пересчитываемый при записи ответа:

```ts
interface WordProgressRecord {
  wordId: string;           // PK
  status: 'new' | 'learning' | 'known' | 'mastered';
  vocabMaturity: number;    // 0..1
  morphMaturity: number;    // 0..1
  nextDue?: number;         // ближайший due среди навыков слова
  updatedAt: number;
}
```

Это денормализация, а не второй источник правды: она полностью восстановима из `skills` и
пересчитывается при импорте бэкапа и при миграциях.

---

## 6. SRS

### 6.1 Изоляция

`ts-fsrs` импортируется **только** в `src/learning/srs/fsrs-adapter.ts`. Остальной код вызывает:

```ts
createInitialState(now: number): SrsState;
review(state: SrsState, rating: Rating, now: number): { next: SrsState; log: SrsLogEntry };
previewIntervals(state: SrsState, now: number): Record<Rating, number>;
isDue(state: SrsState, now: number): boolean;
```

`SrsState` — собственный тип приложения (поля из §5.3), адаптер конвертирует его в `Card` ts-fsrs
и обратно. Смена библиотеки затрагивает один файл.

### 6.2 Рейтинги

Пользовательские: `Again / Hard / Good / Easy`. Для упражнений с автопроверкой маппинг:

```text
неверный ответ                        → Again
верный с опечаткой (после нормализации) → Hard
верный, выбор из вариантов            → Good
верный, ввод текста, быстро           → Easy
```

### 6.3 Демпфирование (требования FR-103, FR-112)

Два случая, когда полный SRS-апдейт вреден:

1. **Повтор ошибки внутри той же сессии.** Пользователь только что увидел правильный ответ.
   Правило: SRS обновляется по **первому** ответу на навык в рамках сессии. Последующие попытки
   пишутся в `reviewLogs` с `srsApplied: false` и в статистику, но `SkillRecord` не трогают.
2. **Practice-режим.** Пользователь сам выбрал, что тренировать; это не то же самое, что
   выданное планировщиком повторение. Правило: при `mode === 'practice'` рейтинг не может
   повысить состояние выше, чем `Good`, а интервал масштабируется коэффициентом < 1.

Оба правила живут в `learning/srs/policy.ts` и покрываются юнит-тестами.

---

## 7. Движок упражнений

### 7.1 Discriminated union

```ts
type Exercise =
  | { type: 'choice'; direction: 'pl-ru' | 'ru-pl'; prompt: string; options: string[]; correct: string }
  | { type: 'input';  direction: 'pl-ru' | 'ru-pl'; prompt: string; accepted: string[] }
  | { type: 'self-assess'; prompt: string; answer: string }
  | { type: 'form-input'; lemma: string; hint: string; slot: SlotLabel; accepted: string[] }
  | { type: 'form-choice'; lemma: string; hint: string; slot: SlotLabel; options: string[]; correct: string }
  | { type: 'table'; lemma: string; cells: TableCell[] }
  | { type: 'matching'; pairs: Array<{ pl: string; ru: string }> };

interface ExerciseInstance {
  id: string;              // uuid, живёт только внутри сессии
  skillId: string;
  exercise: Exercise;
}
```

Добавление типа не требует правки рендерера сессии: `SessionRunner` рендерит по `exercise.type`
через реестр компонентов.

### 7.2 Выбор типа упражнения (`picker.ts`)

Прогрессия из app-design §7 реализуется как функция от состояния навыка, а не как жёсткий сценарий:

```text
skill.state === 'new'       и это первая встреча     → choice
skill.state === 'learning'  и reps < 2               → choice
skill.state === 'learning'  и reps ≥ 2               → input
skill.state === 'review'                              → input (или self-assess при настройке)
```

Разнесение по времени (§ FR-81) достигается тем, что `vocab:pl-ru` и `vocab:ru-pl` — **разные
навыки с разными `due`**. Планировщик естественным образом выдаёт `ru-pl` позже, а не через
искусственный «сценарий первой встречи».

### 7.3 Проверка ответа (`grade.ts`)

Чистая функция. Нормализация перед сравнением:

- trim, схлопывание пробелов (нужно для аналитических форм `będę robić`);
- нижний регистр;
- у русских ответов `ё → е`;
- **польские диакритики не нормализуются** при вводе польского: `zolty ≠ żółty` — это часть навыка.
  Но ответ без диакритики распознаётся как «почти верно» → рейтинг `Hard` + подсветка отличия;
- принимается **любой** из `accepted` (см. §5 требований п.9 — одна форма занимает несколько слотов,
  и наоборот, у слота бывает несколько валидных форм: `aborcji` / `aborcyj`);
- для RU-ответов принимается любой из переводов данного значения.

### 7.4 Дистракторы (`distractors.ts`)

Для vocabulary:

```text
1. кандидаты = слова той же POS
2. фильтр: |rank(candidate) − rank(target)| в пределах ×3 по рангу
3. фильтр: уровень в пределах ±1 ступени CEFR
4. ОТБРОСИТЬ кандидатов, у которых пересекается множество переводов с целевым
   (иначе znać/wiedzieć оба «знать» → вопрос без верного ответа)
5. взять 3, детерминированно по seed от skillId + номера попытки
```

Для морфологии дистракторы берутся **из той же парадигмы** (другие падежи/лица того же слова) —
это и есть содержательная сложность. Формы-омонимы целевого слота исключаются.

Детерминированный seed важен для тестируемости и чтобы один и тот же вопрос не менял варианты
при ре-рендере.

---

## 8. Схема Dexie

```ts
class PolishLearningDatabase extends Dexie {
  skills!: Table<SkillRecord, string>;
  wordProgress!: Table<WordProgressRecord, string>;
  reviewLogs!: Table<ReviewLogRecord, number>;
  sessions!: Table<SessionRecord, number>;
  dailyStats!: Table<DailyStatsRecord, string>;
  settings!: Table<SettingRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('PolishLearningDB');
    this.version(1).stores({
      skills:       'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
      wordProgress: 'wordId, status, nextDue, updatedAt',
      reviewLogs:   '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
      sessions:     '++id, mode, startedAt, endedAt',
      dailyStats:   'date',
      settings:     'key',
      meta:         'key',
    });
  }
}
```

Ключевой запрос — «что повторять»: `skills.where('due').below(now)` по индексу `due`,
и `[kind+due]` для очереди в конкретном разделе. Оба покрыты индексами, полный скан не нужен.

`reviewLogs` (FR-100) хранит введённый ответ:

```ts
interface ReviewLogRecord {
  id?: number;
  sessionId: number;
  skillId: string;
  wordId: string;
  exerciseType: Exercise['type'];
  reviewedAt: number;
  rating: Rating;
  correct: boolean;
  answerGiven: string;      // ← то, что реально ввёл пользователь
  expected: string;
  elapsedMs: number;
  srsApplied: boolean;      // false для повтора ошибки и части practice
}
```

Именно `answerGiven` + `skillId` позже даёт анализ путаницы падежей (FR-104) без изменения схемы.

### Миграции

Каждое изменение схемы — новый `this.version(n).stores({...}).upgrade(tx => ...)`.
Деструктивные изменения запрещены. `wordProgress` всегда восстановим пересчётом из `skills`,
поэтому в миграциях его можно перестраивать целиком.

---

## 9. Роутинг

```text
/                      HomePage
/words                 WordsListPage
/words/:wordId         WordDetailPage
/nouns                 NounsListPage
/verbs                 VerbsListPage
/adjectives            AdjectivesListPage
/session               SessionPage        (режим и очередь — в Zustand)
/session/result        SessionResultPage
/practice              PracticeSetupPage
/stats                 StatsPage
/settings              SettingsPage
```

`:wordId` — URL-encoded `lemma|POS`. React Router (declarative mode), не `HashRouter`;
хостинг обязан отдавать SPA-fallback.

Нижняя навигация (мобильная): `Главная · Слова · Практика · Прогресс`.
Разделы `Сущ. / Глаголы / Прил.` открываются из «Слова» переключателем POS —
это устраняет дублирование четырёх почти одинаковых экранов списка.

---

## 10. Состояние сессии

Активная сессия живёт в Zustand (`stores/session.store.ts`) — это ровно тот случай, для которого
Zustand предназначен по blueprint §14:

```ts
interface SessionState {
  sessionId: number | null;
  mode: 'learn' | 'practice' | 'mistakes';
  queue: ExerciseInstance[];
  currentIndex: number;
  answers: Map<string, AnswerAttempt>;
  firstAnswerBySkill: Map<string, Rating>;   // для правила демпфирования §6.3
  mistakes: ExerciseInstance[];
}
```

Каждый ответ **немедленно** пишется в Dexie (`skills` + `reviewLogs`) — прерванная сессия
не теряет прогресс. Zustand хранит только то, что нужно для отрисовки текущего экрана.

---

## 11. PWA и офлайн

`vite-plugin-pwa` в режиме `generateSW`.

**Precache:** app shell, JS/CSS, иконки, `content/manifest.json`, `content/index.json`,
`content/senses/*.json`. Бюджет ~500 КБ gz (NFR-05).

**Runtime cache:** `content/paradigms/*.json` — `CacheFirst`, `maxEntries: 64`,
`maxAgeSeconds: 1 год`, инвалидация по `contentVersion` в имени кэша.

**Обновление:** `registerType: 'prompt'`. Баннер «Доступна новая версия → Обновить».
Если активна сессия — предложение откладывается до её завершения (NFR-17).

Cache Storage **не** используется для пользовательских данных; IndexedDB **не** используется
как HTTP-кэш.

---

## 12. Совместимость с будущей синхронизацией

Синхронизация не реализуется, но заложено:

- строковые стабильные ID (`wordId`, `skillId`) — независимы от порядка в файлах;
- `createdAt` / `updatedAt` во всех пользовательских записях;
- `schemaVersion` в экспорте;
- весь доступ к БД — через `db/repositories/**`, UI не знает о Dexie;
- FSRS-состояние хранится явными полями, а не как opaque-блоб библиотеки;
- `reviewLogs` не чистятся — история пригодна для восстановления состояния.

Будущий sync-адаптер подключается на уровне repositories, UI не меняется.

---

## 13. Тестирование

| Уровень | Инструмент | Что покрываем |
|---|---|---|
| Unit | Vitest | `learning/**` целиком: grade, distractors, picker, fsrs-adapter, policy, aggregate, skill-id, build-content codec, export/import |
| Component | Vitest + RTL | SessionRunner, типы упражнений, фильтры списка, ReviewRatingButtons, формы настроек |
| E2E | Playwright | открыть → пройти сессию → перезагрузить → прогресс сохранён → повторение доступно → офлайн-режим на production-сборке |

`learning/**` не зависит от React и Dexie, поэтому основная масса логики тестируется быстро и без моков.

---

## 14. Что решено не делать

| Решение | Причина |
|---|---|
| Не создавать SRS-карточку на каждую форму заранее | 195 487 записей; app-design §16 |
| Не хранить агрегированные проценты как истину | Вычисляются из навыков; §5.4 |
| Не делать четыре отдельных экрана списка | Один список с переключателем POS; §9 |
| Не бандлить `data/**` | 36 МБ; §4 |
| Не валидировать 195k форм Zod'ом в рантайме | Бюджет производительности; §4.6 |
| Не реализовывать уроки и grammar-страницы | Конфликт спек, §0 |
| Не добавлять аудио в MVP | Нет ассетов; требования §0 п.7 |
| Не писать кастомный service worker | Blueprint §2: сначала `generateSW` |
