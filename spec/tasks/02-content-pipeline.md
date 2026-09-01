# 02 — Контентный пайплайн

**Зависит от:** 01
**Результат:** `data/**` (36 МБ) превращается в компактные версионированные артефакты в `public/content/**`.

---

## Зачем

Замерено на реальных данных:

| Файл | Raw | Gzip |
|---|---|---|
| `data/words.json` | 5.6 МБ | 0.73 МБ |
| `data/inflections.json` | 29 МБ | 1.40 МБ |

195 487 форм. Бандлить это или парсить целиком на мобильном нельзя (NFR-05, NFR-08).

Целевые артефакты (размеры проверены прототипом кодировщика):

| Артефакт | Raw | Gzip | Кэш |
|---|---|---|---|
| `content/index.json` | 389 КБ | **112 КБ** | precache |
| `content/senses/000..015.json` | 1.1 МБ | **376 КБ** | precache |
| `content/paradigms/000..063.json` | 13.8 МБ | **0.92 МБ** | runtime, CacheFirst |
| `content/manifest.json` | < 4 КБ | — | precache |

---

## Шаги

### 1. Скрипт `scripts/build-content.ts`

Запускается через `npm run build:content`, и автоматически в `prebuild`.
Читает `data/words.json` + `data/inflections.json`, пишет `public/content/**`.
`public/content/` добавить в `.gitignore` — это порождаемый артефакт.

### 2. Словари кодов (`codec`)

Все повторяющиеся строковые значения интернируются в числовые коды. Реальные множества значений
(извлечены из данных):

```text
pos:    NOUN VERB ADJ ADV
level:  A1 A2 B1 B2 C1 C2
number: singular plural
case:   nominative genitive dative accusative instrumental locative vocative
gender (NOUN): feminine masculine_personal masculine_inanimate masculine_animate neuter
gender (ADJ):  masculine_personal non_masculine_personal any masculine_animate_or_personal
               feminine masculine_inanimate neuter masculine_or_neuter masculine
gender (VERB): masculine_personal non_masculine_personal feminine masculine neuter
degree: positive comparative superlative
tense:  present past future
mood:   indicative imperative infinitive
aspect: imperfective perfective
person: 1 2 3
```

**Внимание:** у ADJ девять значений `gender`, четыре из которых — агрегаты
(`any`, `non_masculine_personal`, `masculine_animate_or_personal`, `masculine_or_neuter`).
Словарь кодов и раскладка агрегатов по конкретным родам объявляются здесь и переиспользуются
задачей 22. Не изобретать вторую раскладку в UI.

Словари экспортируются в `manifest.json` и в TS-константы `src/content/codec.ts`,
чтобы клиент и билд не разъезжались.

### 3. `index.json`

Массив кортежей, отсортированный по `frequency.rank`:

```ts
// [lemma, posCode, rank, levelCode, primaryRu, sensesShard, paradigmShard]
```

`primaryRu` — первый перевод основного значения (sense с `primary: true`, иначе первый sense).
`paradigmShard` = `-1`, если парадигмы нет (**14 таких слов**, см. п. 6).

### 4. `senses/NNN.json`

16 шардов. Для каждого `wordId` — все значения:

```ts
{ "kobieta|NOUN": [ { ru: string[]; en?: string; primary: boolean } ] }
```

Поля `frequency.count / per_million / arf / dispersion`, `level_confidence`, `source`
в рантайм-артефакты **не попадают** — они не используются UI и составляют основную массу
`words.json`. Если позже понадобится `source` для отображения качества перевода — добавить
отдельным dev-артефактом.

### 5. `paradigms/NNN.json`

64 шарда. Шард выбирается детерминированной хэш-функцией от `wordId` (FNV-1a), чтобы номер
не менялся между сборками при добавлении слов.

Форма кодируется массивом фиксированной длины (0 = «нет значения»):

```ts
// [form, number, case, gender, degree, tense, person, mood, aspect, analytic]
type EncodedForm = [string, number, number, number, number, number, number, number, number, 0|1];
```

`raw_tag` **не включается** в прод-артефакт (это ~40% объёма). Для отладки писать
`public/content/dev/raw-tags.json` только при `--dev`, и не деплоить.

### 6. Обработка расхождений данных

Скрипт обязан отчитаться и не падать:

- **14 слов без парадигмы** (VERB 2, NOUN 11, ADV 1) → `paradigmShard: -1`, в UI блок «Формы слова» скрыт;
- **2 парадигмы без слова** → игнорируются, пишутся в отчёт;
- **202 существительных с несколькими значениями `gender`** в одной парадигме → сохранить род
  на уровне *формы* (как в исходных данных), а на уровне парадигмы записать доминирующий род
  отдельным полем `dominantGender` для отображения в шапке карточки;
- **дубли `form` в разных слотах** (`aborcji` = sg.gen / sg.dat / sg.loc) → сохраняются как есть,
  дедупликация запрещена: это разные слоты обучения.

### 7. `manifest.json`

```ts
{
  contentVersion: string;   // sha256 от data/words.json + data/inflections.json, первые 12 символов
  generatedAt: string;
  counts: { words: number; paradigms: number; forms: number };
  shards: { senses: number; paradigms: number };
  codec: { pos: string[]; level: string[]; case: string[]; /* … */ };
}
```

### 8. Валидация в билде

Zod-схемы (`src/content/content.schema.ts`) валидируют **вход** (`data/**`) и **выход**.
Билд падает при нарушении. В рантайме валидируется только `manifest.json` (NFR: не валидировать
195k форм на мобильном).

### 9. Отчёт

Скрипт печатает: число слов, парадигм, форм, размеры артефактов до/после gzip, список расхождений.
Если `index.json` gzip превысил 150 КБ или сумма precache превысила 500 КБ — предупреждение.

---

## Acceptance

- [ ] `npm run build:content` порождает `public/content/**` и печатает отчёт
- [ ] `index.json` содержит ровно 7998 записей
- [ ] Сумма форм во всех шардах парадигм = 195 487
- [ ] Gzip `index.json` ≤ 150 КБ; gzip всех парадигм ≤ 1.2 МБ
- [ ] Повторный запуск даёт побайтово идентичный результат (детерминированность)
- [ ] Номер шарда для `kobieta|NOUN` не меняется между запусками
- [ ] Все 14 слов без парадигмы помечены `paradigmShard: -1`
- [ ] Юнит-тесты: кодирование↔декодирование формы round-trip, стабильность хэша шарда, обработка мульти-gender существительных
- [ ] `public/content/` в `.gitignore`, `prebuild` вызывает генерацию
