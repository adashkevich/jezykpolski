# 46 — Словарь v2: сборка `data/words.json` из отредактированных чанков

**Зависит от:** 02
**Результат:** `data/words.json` (schema_version 2) собран из `data/words_parts/output/words_NNN.json`
одним детерминированным скриптом, провалидирован, без дублей слов и `sense_id`. Рядом лежит
`data/word-id-renames.json` — карта «старый `wordId` → новый», без которой задача 48 не сможет
перенести прогресс.

---

## Зачем

Словарь вычитан и переработан вне репозитория (`data/words_parts/AGENTS.md` — инструкция редактора,
`NOTES.md` — журнал правок). 80 чанков по 100 слов (последний — 92), всего 7992 слова и 13153
значения. Что изменилось относительно текущего `data/words.json`:

| Поле | Было | Стало |
|---|---|---|
| `senses[].gloss_en` | англ./польск. пояснение | удалено, вместо него `gloss_pl` (по-польски) |
| `senses[].translation_by`, `translation_ua` | — | массивы переводов, всегда непустые |
| `senses[].example_pl` | — | пример употребления именно этого значения |
| `senses[].sense_id` | — | `"<lemma>:<slug>"`, постоянный идентификатор значения |
| `senses[].introduced_at`, `level_confidence` | — | `{ru, by, ua}` у **каждого** значения |
| `introduced_at` слова | строка `"B1"` | `{ru, by, ua}` = минимум по значениям |
| `level_confidence` слова | число | `{ru, by, ua}` |
| `pos` | только NOUN/VERB/ADJ/ADV | + `PRON` (15), `SCONJ` (1), `DET` (1), `INTJ` (1) |
| `lemma` | | исправлены: 13 возвратных глаголов получили `się` (`spocić` → `spocić się`), `wpatrować` → `wpatrywać się`, `piast` → `piasta`, `wieczor` → `wieczór`, `podróża` → `podróż` |

`frequency.rank` у всех 7992 слов сохранён и уникален — это единственный надёжный ключ сопоставления
старой и новой версии (`lemma|pos` у 37 слов поменялся).

## Найденные проблемы данных (проверено скриптом на всех 80 чанках)

**1. Пять пар слов схлопнулись в один `wordId`.** Раньше их разводил неверный POS или опечатка в
лемме, после правки они совпали:

| `wordId` | остаётся (rank) | дубль (rank, старый `wordId`) |
|---|---|---|
| `inny\|ADJ` | 17 | 1619, `inny\|NOUN` |
| `dziś\|ADV` | 137 | 1239, `dziś\|NOUN` |
| `wieczór\|NOUN` | 470 | 3245, `wieczor\|NOUN` |
| `dzisiaj\|ADV` | 477 | 3266, `dzisiaj\|NOUN` |
| `podróż\|NOUN` | 863 | 5085, `podróża\|NOUN` |

Индекс строится по `wordId`, так что дубль либо сломал бы сборку, либо молча перезаписал запись.
**Решение:** остаётся более частотная запись (меньший rank) как есть, дубль удаляется. Значения
дубля не переносятся — во всех пяти случаях они повторяют значения оставшейся записи.

Шестой случай того же рода — `niektóry|DET` (4822, бывший `niektóry|NOUN`) рядом с
`niektóry|ADJ` (195): одна лексема, одно значение `niektóry:some` у обеих. Сливается в
`niektóry|ADJ` по тому же правилу. Итог: **7986 слов**, `DET` в корпусе не остаётся.

**2. Семь `sense_id` не уникальны.** Пять уходят вместе с дублями выше; остаются межчастеречные
совпадения:

| `sense_id` | у кого | исправление |
|---|---|---|
| `prawo:right` | `prawo\|NOUN` (105) и `prawo\|ADV` (4184) | у ADV → `prawo:right_adv` |
| `czarny:black_person` | `czarny\|ADJ` (298) и `czarny\|NOUN` (7769) | у NOUN → `czarny:black_person_noun` |
| `napaść:attack` | `napaść\|VERB` (6662) и `napaść\|NOUN` (7476) | у NOUN → `napaść:attack_noun` |

Правило: переименовывается значение **менее частотного** слова, суффикс `_<pos в нижнем регистре>`.
`sense_id` по условию постоянный, поэтому правка вносится один раз прямо в чанк
(`output/words_NNN.json`), а не генерируется при каждой сборке.

---

## 1. `data/words-fixups.json`

Явный список правок из таблиц выше — чтобы скрипт сборки ничего не решал «эвристикой»:

```jsonc
{
  "dropWords": [
    { "rank": 1619, "lemma": "inny", "pos": "ADJ", "mergeInto": "inny|ADJ" },
    { "rank": 1239, "lemma": "dziś", "pos": "ADV", "mergeInto": "dziś|ADV" },
    { "rank": 3245, "lemma": "wieczór", "pos": "NOUN", "mergeInto": "wieczór|NOUN" },
    { "rank": 3266, "lemma": "dzisiaj", "pos": "ADV", "mergeInto": "dzisiaj|ADV" },
    { "rank": 5085, "lemma": "podróż", "pos": "NOUN", "mergeInto": "podróż|NOUN" },
    { "rank": 4822, "lemma": "niektóry", "pos": "DET", "mergeInto": "niektóry|ADJ" }
  ]
}
```

Переименования `sense_id` в fixups не входят — они правятся в самих чанках (см. выше).

## 2. `scripts/assemble-words.ts` (`npm run assemble:words`)

1. Читает `data/words_parts/output/words_*.json` в порядке номера, проверяет, что `part` идут
   подряд, `range` не пересекаются, длина `words` = `range[1] - range[0] + 1`.
2. Валидирует каждое слово схемой `RawWordV2Schema` (задача 47 §1 — схема живёт в
   `content.schema.ts`, скрипт её импортирует).
3. Применяет `dropWords`.
4. Проверяет инварианты, падает с понятным списком нарушений:
   - `wordId` уникален; `sense_id` уникален во всём словаре; `frequency.rank` уникален;
   - ровно одно `primary: true` у каждого слова;
   - `introduced_at[lang]` слова = минимум `introduced_at[lang]` по его значениям (для `ru`, `by`, `ua`);
   - нет `gloss_en`; `translation_*` непустые; `gloss_pl`/`example_pl` непустые;
   - `sense_id` начинается с `"<lemma без się>:"` или `"<lemma>:"` (мягкая проверка — warning).
5. Пишет `data/words.json`:
   ```jsonc
   { "schema_version": 2, "generated_at": "<max mtime чанков, ISO>", "source": "words_parts/output",
     "counts": { "total": 7986, "senses": …, "A1": …, … /* по primary-значению, профиль ru */ },
     "words": [ … отсортировано по frequency.rank … ] }
   ```
   `generated_at` — не wall-clock: от него зависит `contentVersion`, а повторная сборка должна
   давать байт-в-байт тот же файл.
6. Пишет `data/word-id-renames.json` — **только при первом запуске**, пока в `data/words.json` ещё
   лежит schema_version 1 (если старый файл уже v2 — карта не перезаписывается):
   ```jsonc
   { "fromContent": "<contentVersion v1>", "renames": { "to|NOUN": "to|PRON", "spocić|VERB": "spocić się|VERB", "inny|NOUN": "inny|ADJ", … } }
   ```
   Строится соединением старых и новых слов по `frequency.rank` с учётом `dropWords` (старый
   `wordId` выброшенного дубля → `mergeInto`). Ожидается ровно 37 записей. Файл коммитится: после
   замены `words.json` восстановить его больше не из чего.

## 3. Что делать с `data/words_parts/`

`output/` — исходник словаря, коммитится. Дальнейшие правки слов делаются в чанках, затем
`npm run assemble:words && npm run build:content`. `input/` (снимок до правки) и `AGENTS.md`/`NOTES.md`
тоже коммитятся — это история редактуры и инструкция для следующей вычитки.

В `package.json` `assemble:words` в `prebuild` **не** добавлять: сборка контента читает
закоммиченный `data/words.json`, а пересборка из чанков — осознанное действие редактора.

---

## Acceptance

- [ ] `npm run assemble:words` на чистом дереве даёт `data/words.json` с 7986 словами, повторный
      запуск — байт-в-байт тот же файл
- [ ] Скрипт падает (exit ≠ 0) на дубле `wordId`, дубле `sense_id`, слове без primary или с двумя,
      несогласованном `introduced_at` слова — по тесту на каждый случай (`scripts/assemble-words.test.ts`
      на маленьких фикстурах)
- [ ] `data/word-id-renames.json` содержит 37 записей; каждое значение — существующий новый `wordId`,
      ни один ключ не является новым `wordId`
- [ ] В чанках переименованы три `sense_id` из таблицы, `sense_id` уникальны по всему словарю
- [ ] `npm run lint` проходит
