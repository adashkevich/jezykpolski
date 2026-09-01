# 03 — Доменная модель навыков

**Зависит от:** 02
**Результат:** типы и чистые функции домена в `src/learning/**`, покрытые тестами, без зависимостей от React и Dexie.

---

## Принцип

Минимальная единица обучения — **навык**, а не слово (`spec/architecture.md` §1, app-design §31).

---

## Шаги

### 1. `learning/skills/skill-id.ts`

```ts
type WordId = string;   // "kobieta|NOUN"
type SkillId = string;  // "kobieta|NOUN::noun:sg:genitive"

encodeWordId(lemma: string, pos: Pos): WordId
decodeWordId(id: WordId): { lemma: string; pos: Pos }
encodeSkillId(wordId: WordId, dimension: Dimension): SkillId
decodeSkillId(id: SkillId): { wordId: WordId; dimension: Dimension }
```

`lemma|pos` уникальна во всём корпусе (проверено: 0 дубликатов), поэтому годится как стабильный ID.
Разделитель навыка — `::`, чтобы не конфликтовать с `|` внутри `wordId`.

### 2. `learning/skills/dimensions.ts`

Типизированное пространство измерений + человекочитаемые подписи (польские и русские):

```text
vocab:pl-ru · vocab:ru-pl
noun:<number>:<case>
verb:<tense>:<person>:<number>
verb:past:<person>:<number>:<gender>
verb:imperative:<person>:<number>
adj:<number>:<gender>:<case>
adj:degree:<degree>
adv:degree:<degree>
```

Здесь же — **канонический порядок отображения** падежей (M. D. C. B. N. Ms. W.), лиц, времён и родов.
UI не сортирует их самостоятельно.

Подписи: `Dopełniacz` / `Родительный` — показывать польское название основным (пользователь учит
польскую терминологию), русское — вспомогательным.

### 3. `learning/skills/enumerate.ts`

```ts
enumerateSkills(word: WordIndexEntry, paradigm?: Paradigm): SkillDescriptor[]
```

Возвращает **все возможные** навыки слова. Это знаменатель для расчёта процентов —
записей в БД для них может не быть (ленивая материализация, `architecture.md` §5.2).

Правила:
- у любого слова всегда есть `vocab:pl-ru` и `vocab:ru-pl`;
- морфологические навыки порождаются из реальных форм парадигмы, а не из декартова произведения
  измерений — иначе появятся слоты, которых у слова не существует;
- у одного слота может быть несколько валидных форм (`aborcji` / `aborcyj` для sg.gen) →
  это **один** навык с несколькими принимаемыми ответами;
- аналитические формы глагола (`analytic: true`) — обычные навыки, но проверка ответа учитывает пробел;
- ADJ-формы с агрегатным `gender` (`any`, `non_masculine_personal`, …) раскладываются
  по конкретным родам через раскладку из задачи 02.

### 4. `learning/progress/aggregate.ts`

```ts
skillMaturity(skill: SkillRecord | undefined): number   // 0..1, undefined → 0
aggregateWord(all: SkillDescriptor[], known: Map<SkillId, SkillRecord>): WordAggregate
aggregateByDimension(...): Map<string, number>          // по падежам, временам, родам
deriveStatus(agg: WordAggregate): 'new' | 'learning' | 'known' | 'mastered'
```

Зрелость выводится из FSRS `stability`, а не из счётчика правильных ответов:

```text
maturity = clamp(stability / TARGET_STABILITY_DAYS, 0, 1),  TARGET_STABILITY_DAYS = 60
```

Пороги статусов — в `architecture.md` §5.4. Значения вынести в константы, а не размазывать по коду.

### 5. Типы записей

`src/types/progress.ts` — `SkillRecord`, `WordProgressRecord`, `ReviewLogRecord`,
`SessionRecord`, `DailyStatsRecord`. Полные определения — `architecture.md` §5.3, §8.
Здесь только типы; запись в БД — задача 05.

---

## Ограничения

- `learning/**` **не импортирует** React, Dexie и ничего из `features/**`.
- Никаких дат как `Date` в персистентных типах — только `number` (epoch ms): индексируется
  диапазоном в Dexie и корректно сериализуется в экспорт.

---

## Acceptance

- [ ] `encodeSkillId` / `decodeSkillId` — round-trip на всех типах измерений
- [ ] `enumerateSkills` для `kobieta|NOUN` даёт 2 vocab + все реальные слоты парадигмы, без выдуманных
- [ ] `enumerateSkills` для слова без парадигмы (одно из 14) даёт ровно 2 навыка и не падает
- [ ] `enumerateSkills` для ADJ корректно раскладывает агрегатные роды
- [ ] Слот с несколькими формами даёт один навык с несколькими accepted-ответами
- [ ] `deriveStatus` покрыт тестами на границах порогов
- [ ] `aggregateWord` возвращает 0 для слова без единой записи в БД
- [ ] В `learning/**` нет импортов React/Dexie (проверяется ESLint-правилом `no-restricted-imports`)
