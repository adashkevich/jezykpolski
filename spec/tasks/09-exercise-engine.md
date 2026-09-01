# 09 — Движок упражнений

**Зависит от:** 03, 04
**Результат:** типы упражнений, генерация, выбор типа, проверка ответа — чистый домен с тестами.

---

## Шаги

### 1. `learning/exercises/exercise.types.ts`

Discriminated union — полное определение в `architecture.md` §7.1.
Добавление нового типа не должно требовать правки runner'а: рендеринг идёт через реестр
`Record<Exercise['type'], ComponentType<ExerciseProps>>`.

### 2. `learning/exercises/picker.ts`

Какой тип упражнения показать для навыка (app-design §7, §18):

```text
skill отсутствует или state='new'      → choice   (recognition, level 1-2)
state='learning', reps < 2             → choice
state='learning', reps ≥ 2             → input    (active recall, level 3-4)
state='review'                          → input, либо self-assess по настройке
state='relearning'                      → choice   (мягкий возврат после провала)
```

Направление (`pl-ru` / `ru-pl`) **не выбирается** picker'ом: это разные навыки с разными `due`,
планировщик сам выдаёт нужный. Именно так реализуется разнесение прогрессии по времени
из app-design §7, без искусственного сценария «первой встречи».

Для морфологии: `form-choice` на ранних стадиях, `form-input` дальше. `table` — только Practice
(FR-62: таблица не подходит для ежедневного SRS).

### 3. `learning/exercises/generate.ts`

```ts
generateExercise(skill: SkillDescriptor, srs: SkillRecord | undefined, ctx: ContentContext, seed: number): ExerciseInstance
```

Детерминированность по `seed` обязательна: варианты ответа не должны меняться при ре-рендере,
и тесты должны быть воспроизводимы.

### 4. `learning/exercises/grade.ts` — проверка ответа

Чистая функция:

```ts
grade(exercise: Exercise, answer: string): GradeResult
// { correct: boolean; nearMiss: boolean; matched?: string; diff?: DiffHint }
```

Правила нормализации:

| Правило | Применяется |
|---|---|
| trim, схлопывание внутренних пробелов | всегда — нужно для `będę  robić` |
| нижний регистр | всегда |
| `ё → е` | только для русских ответов |
| диакритики польского | **НЕ нормализуются** — `zolty ≠ żółty` |
| ответ без диакритик при верных буквах | `nearMiss: true` → рейтинг `Hard`, подсветить отличие |
| любой из `accepted` | всегда (у слота бывает несколько форм) |
| любой перевод значения для RU-ответа | всегда |

`nearMiss` — важная механика: она не даёт пользователю страдать из-за раскладки, но и не позволяет
считать `zolty` полностью верным.

### 5. Границы

`learning/exercises/**` не импортирует React. Контент приходит через параметр `ContentContext`
(интерфейс, реализуемый слоем 04) — домен не знает про fetch и шарды.

---

## Acceptance

- [ ] Round-trip тесты `picker` на всех состояниях навыка
- [ ] `generateExercise` с одинаковым seed даёт побайтово одинаковый результат
- [ ] `grade` принимает `będziemy robić` при вводе `będziemy  robić` (двойной пробел)
- [ ] `grade` принимает `aborcji` и `aborcyj` для sg.gen
- [ ] `grade` помечает `zolty` как `nearMiss`, а не как верный
- [ ] `grade` принимает `ежик` для ответа `ёжик`
- [ ] `grade` не принимает пустую строку
- [ ] Добавление нового типа упражнения не требует изменений в `session-runner`
- [ ] Ни одного импорта React в `learning/exercises/**`
