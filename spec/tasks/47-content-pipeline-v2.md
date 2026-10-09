# 47 — Контентный пайплайн v2: значения, три профиля уровней, новые части речи

**Зависит от:** 46
**Результат:** `scripts/build-content.ts` читает `data/words.json` v2. Индекс несёт уровень слова
**по primary-значению** для трёх профилей (ru/by/ua), шарды значений — переводы ru/by/ua и уровень
каждого значения, польские пояснения и примеры вынесены в отдельные ленивые шарды. Слова с
изменённым `wordId` по-прежнему находят свою парадигму.

---

## Зачем

Задача 02 строила индекс из строкового `introduced_at` слова и `gloss_en`. Оба поля исчезли.
Важнее другое: в v2 `introduced_at` слова — минимум по **всем** значениям, а учим мы пока только
primary (задача 49). У 520 слов они расходятся: например, у `prawo|NOUN` слово «A1» за счёт
значения «правая сторона», а primary «закон» — A2. Если гейт уровней будет смотреть на уровень
слова, «закон» придёт в A1. Поэтому уровень в индексе — уровень primary-значения.

Распределение primary-значений (профиль ru): A1 1178, A2 2602, B1 3218, B2 962, C1 29, C2 3 —
против A1 386 / A2 1116 / B1 2401 / B2 3141 / C1 933 / C2 21 в v1. 6111 слов стали «легче», 53 —
«тяжелее».

## Бюджет

Полный перенос новых полей в шарды значений раздувает их с 404 KB до ~1.07 MB gzip. Шарды значений
прогреваются при старте (`senses-prewarm.ts`) и нужны дистракторам синхронно, поэтому делим:

| Артефакт | Содержимое | gzip (оценка) | Загрузка |
|---|---|---|---|
| `senses/NNN.json` | `id`, `ru`, `by`, `ua`, уровни, `primary` | ~410 KB | как сейчас (prewarm) |
| `sense-details/NNN.json` | `gloss_pl`, `example_pl` по `id` | ~590 KB | лениво, только карточка слова и фидбэк (задача 50) |

---

## 1. `content.schema.ts`

- `RawSenseV2Schema`: `sense_id`, `translation_ru|by|ua` (min 1), `gloss_pl`, `example_pl`,
  `introduced_at: LevelTriple`, `level_confidence: {ru,by,ua: number}`, `primary`, `source?`,
  `pos?` (3 значения в корпусе несут собственный POS — сохраняем, в рантайм не отдаём).
- `RawWordV2Schema`, `WordsJsonV2Schema` (`schema_version: z.literal(2)`). Схемы v1 удаляются —
  других читателей у них нет.
- `IndexRowSchema`: `[id, posCode, rank, levelRu, levelBy, levelUa, primaryRu, sensesShard, paradigmShard]`.
  Уровни — коды `LEVEL` primary-значения.
- `SenseEntrySchema`: `{ id, ru, by, ua, lv: [ru, by, ua] /* коды LEVEL */, primary }`. `en` удаляется.
- Новый `SenseDetailsShardSchema`: `Record<senseId, { gl: string, ex: string }>`.
- `ManifestSchema.shards` получает `senseDetails`.

`level_confidence` в рантайм не идёт — используется только редактором словаря.

## 2. `codec.ts` — новые части речи

`POS_VALUES = ['NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'SCONJ', 'INTJ']` — **только дописыванием в
конец**: коды позиционные, старые коды NOUN…ADV не должны сдвинуться. (`DET` после задачи 46 в
корпусе нет — не добавлять.)

TypeScript заставит пройти все `Record<PosValue, …>` (`POS_LABELS` и др.). Для новых POS:

- подписи: «местоимение», «союз», «междометие»;
- `enumerateSkills` — только три vocab-навыка, грамматических измерений нет (как у слов без
  парадигмы сейчас);
- `PosTabs`/`FilterSheet` — новые POS попадают под фильтр «Все» и отдельную вкладку не получают
  (17 слов); проверить, что ни один `switch (pos)` не падает в `default: throw`.

## 3. `build-content.ts`

- Читает `WordsJsonV2Schema`; `primaryRu` = `primary.translation_ru[0]`.
- Уровни строки индекса — `primary.introduced_at.{ru,by,ua}`.
- Порядок значений в шарде: primary первым, остальные — в порядке файла (раньше это обеспечивал
  сам порядок источника; теперь primary бывает не первым — `być:copula` второй).
- Пишет `sense-details/NNN.json` тем же шардингом, что и `senses` (`senseShardIndex(wordId)`), ключ —
  `sense_id`.
- **Псевдонимы парадигм.** `inflections.json` по-прежнему ключён старыми `wordId`. Если нового
  `wordId` в нём нет, ищем по обратной карте `data/word-id-renames.json` (задача 46). Исключения:
  - `wpatrywać się|VERB` → `wpatrywać|VERB` (а не `wpatrować|VERB`: старая запись была другим
    глаголом, а правильная парадигма в `inflections.json` уже есть);
  - `piasta|NOUN` → без парадигмы (`piast|NOUN` — форма Gen.pl, а не лемма);
  - новые POS (`PRON`, `SCONJ`, `INTJ`) → без парадигмы: старые «парадигмы» `co|NOUN`, `to|NOUN`
    и т.п. — это 6–8 падежных форм, размеченных как существительное; учить их как склонение
    существительного неверно.
  Итого возвратные глаголы (`spocić się` и ещё 11) получают парадигму без `się` — формы спряжения
  те же, `się` в упражнениях на формы не вводится. Явная таблица исключений — в
  `scripts/paradigm-aliases.ts`, не в коде сборки.
- Отчёт о расхождениях: новый вид `paradigm-alias` со списком примененных псевдонимов; число слов
  без парадигмы ожидается 27: 18 новых (15 `PRON`, `gdy`, `dzięki`, `piasta`) и 9, у которых её не
  было и раньше (`powinien`, `winien`, `ja`, `a`, `m`, `x`, `niczym`, `polonia`, `express`).
- `contentVersion` — как раньше, хэш входных файлов (`words.json` + `inflections.json`). Смена
  версии штатно сбрасывает кэши шардов (`stale-cache-cleanup.ts`).

## 4. Рантайм-слой контента

- `types/content.ts`: `WordIndexEntry.level` остаётся — это уровень **активного профиля**
  (задача 51; до неё — всегда `ru`), плюс `levels: Readonly<Record<LangProfile, LevelValue>>`.
  `Sense` → `{ id, ru, by, ua, levels, primary }`.
- `loader.ts` декодирует новую строку; `loadSenseDetailsShard(n)` — по образцу
  `loadParadigmShard` (runtime-кэш `sense-details`, `cache-names.ts`).
- `content/senses.ts`: `getSenseDetails(wordId): Promise<Map<senseId, {gloss, example}>>`.
- `vite.config.ts`: `content/sense-details/*.json` исключить из precache (как `paradigms`),
  добавить runtime-маршрут.
- `index-store.ts#byLevel` строится по `entry.level` — без изменений, но после задачи 51 его надо
  пересобирать при смене профиля.

---

## Acceptance

- [ ] `npm run build` проходит; отчёт пайплайна: 7986 слов, 0 дублей, список псевдонимов парадигм
- [ ] Коды `NOUN`/`VERB`/`ADJ`/`ADV` в `manifest.codec.pos` те же, что до задачи
- [ ] `spocić się|VERB` открывается в карточке с таблицей спряжения; `to|PRON` — без таблицы форм
- [ ] `prawo|NOUN` в индексе имеет уровень A2 (по primary), а не A1
- [ ] Шарды `senses` в сумме ≤ 450 KB gzip; `sense-details` не попадают в precache
      (`npm run build` → `check-bundle-size` зелёный)
- [ ] Тесты лоадера на новую строку индекса и на шард деталей; `npm test`, `npm run lint` проходят
