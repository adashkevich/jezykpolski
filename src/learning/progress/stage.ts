/**
 * Этап изучения слова (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2,
 * FR-80/FR-81/FR-83, extended by `spec/tasks/37-three-stage-vocabulary.md` §1-2,
 * `spec/tasks/40-vocab-streak-progression.md`, `spec/architecture.md` §5.4/§7.2).
 *
 * У перевода три этапа, и все три выражены существующими навыками — новых полей в БД не
 * появляется:
 *
 *   этап 1 — `vocab:pl-ru`, узнавание: выбрать русский перевод из списка;
 *   этап 2 — `vocab:ru-pl-choice`, узнавание по-польски: выбрать польское слово из списка
 *            (те же дистракторы, что у этапа 1, только по-польски — `generate.ts`'s
 *            `buildVocabChoice` уже симметричен по направлению, task 28's decision log);
 *   этап 3 — `vocab:ru-pl-input`, воспроизведение: написать слово по-польски.
 *
 * Задача 28 держала переход 1→2 на `state === 'review'` — один верный ответ. Задача 37
 * заменила это порогом накопленной стабильности FSRS (7 / 10 дней) — несколько успешных
 * повторений по расписанию, а не один, но ценой 2-3 недель календарного времени до первого
 * ввода, поскольку интервалы между повторениями растут быстрее, чем нужно для простого
 * "пользователь явно не ошибается". Задача 40 меняет саму метрику: вместо стабильности —
 * серия подряд идущих верных ответов на текущем этапе
 * (`CUED_RECALL_UNLOCK_STREAK` / `PRODUCTION_UNLOCK_STREAK` ниже, `SkillRecord.correctStreak`),
 * которая не ждёт расписания FSRS и переносится в следующую сессию, а не следующую неделю.
 * Порог стабильности остаётся второй, более слабой веткой — единственный случай, где он ещё
 * что-то решает: слово, поднятое свайпом/кнопкой «Знаю» (`policy.ts#createSwipeKnownState`,
 * `stability: 30` при `correctStreak: 0`), должно открыть следующий этап на первом же
 * оценённом ответе, не набирая серию заново — иначе кнопка "Знаю" ничего бы не ускоряла.
 *
 * Каждый следующий этап существует ровно тогда, когда у соответствующего навыка есть
 * `SkillRecord` (architecture.md §5.2's lazy materialization читается здесь как «навык
 * открыт»): до этого момента планировщик физически не может его выдать, потому что
 * `getDueSkills` смотрит только на существующие записи. `shouldUnlockCuedRecall` /
 * `shouldUnlockProduction` — единственные места, где решается, когда запись создавать.
 *
 * Чистый домен: ни React, ни Dexie, ни `features/**` (architecture.md §3).
 */
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import type { SkillRecord } from '@/types/progress.ts'

export type LearningStage =
  /** Нет ни одной записи vocab-навыка — слово ещё не начинали. */
  | 'not-started'
  /** Идёт этап 1: есть `vocab:pl-ru`, но `vocab:ru-pl-choice` ещё не открыт. Слово узнаётся
   *  по-русски, но узнавание по-польски и написание ещё не пробовали — это часть владения
   *  словом, но не всё (FR-83). */
  | 'recognition'
  /** Идёт этап 2: `vocab:ru-pl-choice` открыт, но `vocab:ru-pl-input` ещё нет. Слово
   *  узнаётся среди польских вариантов, но написать его пользователь не пробовал. */
  | 'cued-recall'
  /** Этап 3 открыт: `vocab:ru-pl-input` существует, слово тренируется на написание. */
  | 'production'

/** Сколько дней стабильности `vocab:pl-ru` нужно набрать, чтобы открылся этап 2
 *  (`vocab:ru-pl-choice`) — задача 37's исходный порог, сохранённый как запасная ветка
 *  `shouldUnlockCuedRecall` (см. `CUED_RECALL_UNLOCK_STREAK` для основного, задача 40). */
export const RECOGNITION_UNLOCK_STABILITY_DAYS = 7

/** Тот же запасной порог для перехода 2→3, сохранённый ради `PRODUCTION_UNLOCK_STREAK`'s
 *  собственного doc comment — см. `CUED_RECALL_UNLOCK_STABILITY_DAYS` выше. */
export const CUED_RECALL_UNLOCK_STABILITY_DAYS = 10

/** Сколько верных ответов ПОДРЯД на `vocab:pl-ru` нужно набрать, чтобы открылся этап 2
 *  (`vocab:ru-pl-choice`) — задача 40's основной механизм, вместо задачи 37's порога
 *  стабильности (`RECOGNITION_UNLOCK_STABILITY_DAYS` выше, оставлен как запасная ветка для
 *  свайп-известных слов, см. этого файла заголовок). Любой неверный ответ обнуляет серию
 *  (`nextCorrectStreak` ниже) — быстрый переход получают только слова, на которых
 *  пользователь ни разу не ошибся на этом этапе, а не просто "ответил дважды". */
export const CUED_RECALL_UNLOCK_STREAK = 2

/** Тот же механизм для перехода 2→3 (`vocab:ru-pl-choice` -> `vocab:ru-pl-input`) — на одно
 *  повторение больше `CUED_RECALL_UNLOCK_STREAK`: переход к свободному воспроизведению
 *  (написать слово по памяти) — более серьёзный шаг, чем переход к узнаванию на другом
 *  языке, и explicitly просился пользователем как "три подряд", не два. */
export const PRODUCTION_UNLOCK_STREAK = 3

/**
 * Считает следующее значение `SkillRecord.correctStreak` для одного оценённого ответа.
 *
 * `srsApplied` — тот же флаг, что `policy.ts#shouldApplySrs` — обязателен: без него повтор
 * одного и того же навыка внутри одной сессии (перезапрос после ошибки,
 * `SessionRunner.tsx`'s requeue) двигал бы серию сразу после того, как её же обнулил, и порог
 * в "N подряд" набирался бы за одну сессию из одной ошибки и одного её исправления —
 * ровно то, что демпфирование `shouldApplySrs` уже запрещает для самой SRS-оценки. Когда
 * `srsApplied` ложно, серия остаётся как была: ни инкремента, ни обнуления.
 */
export function nextCorrectStreak(
  previous: number | undefined,
  correct: boolean,
  srsApplied: boolean,
): number {
  if (!srsApplied) return previous ?? 0
  return correct ? (previous ?? 0) + 1 : 0
}

/**
 * Пора ли открывать этап 2 для слова, чей `vocab:pl-ru` только что получил оценку.
 *
 * Функция намеренно принимает *уже обновлённое* состояние навыка (то, что вызывающая
 * сторона собирается записать), а не читает БД сама — тот же контракт, что и у задачи 28's
 * `shouldUnlockProduction`.
 *
 * Основная ветка — серия верных ответов подряд (задача 40). Запасная ветка — накопленная
 * стабильность (задача 37): она не проверяет `state` отдельно, так как у FSRS стабильность
 * не обнуляется при `Again`/`Hard`, только демпфируется — единственный практический случай,
 * когда она ещё решает, это свайп-известное слово (`stability: 30`, `correctStreak: 0`),
 * которому серия не нужна вовсе.
 */
export function shouldUnlockCuedRecall(recognition: SkillRecord | undefined): boolean {
  return (
    (recognition?.correctStreak ?? 0) >= CUED_RECALL_UNLOCK_STREAK ||
    (recognition?.stability ?? 0) >= RECOGNITION_UNLOCK_STABILITY_DAYS
  )
}

/** Пора ли открывать этап 3 для слова, чей `vocab:ru-pl-choice` только что получил оценку.
 *  Тот же принцип, что у `shouldUnlockCuedRecall` — принимает уже обновлённое состояние. */
export function shouldUnlockProduction(cuedRecall: SkillRecord | undefined): boolean {
  return (
    (cuedRecall?.correctStreak ?? 0) >= PRODUCTION_UNLOCK_STREAK ||
    (cuedRecall?.stability ?? 0) >= CUED_RECALL_UNLOCK_STABILITY_DAYS
  )
}

/**
 * Canonical ascending order of the three vocab stages (задача 40) — the same order
 * `stageOf` below already implies (`vocab:ru-pl-input` most advanced, `vocab:pl-ru` least),
 * named explicitly here so `build-learn-queue.ts#collapseVocabStages` and
 * `answer-pipeline.ts`'s cascade (§2 of the task) share one ranking instead of each
 * re-deriving it.
 */
export const VOCAB_STAGE_ORDER: readonly VocabDimension[] = [
  'vocab:pl-ru',
  'vocab:ru-pl-choice',
  'vocab:ru-pl-input',
]

/** `VOCAB_STAGE_ORDER`'s index of `dimension` — higher means a more advanced stage. */
export function vocabStageRank(dimension: VocabDimension): number {
  return VOCAB_STAGE_ORDER.indexOf(dimension)
}

/**
 * Every vocab stage strictly BELOW `dimension` in `VOCAB_STAGE_ORDER` — e.g.
 * `vocab:ru-pl-input` -> `['vocab:pl-ru', 'vocab:ru-pl-choice']`, `vocab:pl-ru` -> `[]`.
 * Used by `answer-pipeline.ts#submitAnswer`'s "one question per word per session" cascade
 * (задача 40 §2): a correct answer on the more advanced stage credits every less advanced
 * one too, so the session never asks the same word's translation twice.
 */
export function lowerVocabDimensions(dimension: VocabDimension): readonly VocabDimension[] {
  return VOCAB_STAGE_ORDER.slice(0, vocabStageRank(dimension))
}

/**
 * Реально ли слово хоть раз успешно набрано по-польски — точный предикат под
 * трёхнавыковой моделью (задача 37): `vocab:ru-pl-input` показывает только упражнения на
 * печать, поэтому `state === 'review'` на нём означает ровно это, без всякой
 * неоднозначности. `aggregate.ts#deriveStatus` использует его как отдельный жёсткий гейт
 * для статуса `known` — усреднение `vocabMaturity` по трём навыкам одного этого не
 * гарантирует: достаточно зрелые `pl-ru`/`ru-pl-choice` вытягивают среднее выше порога и
 * без единого набранного ответа.
 */
export function hasGraduatedProduction(skills: readonly SkillRecord[]): boolean {
  return skills.some(
    (skill) => skill.dimension === 'vocab:ru-pl-input' && skill.state === 'review',
  )
}

/**
 * Этап слова по его записям навыков. На вход можно отдавать все записи слова — не-vocab
 * отфильтровываются здесь же, чтобы вызывающим сторонам (`progress/aggregate.ts`) не
 * приходилось делать это дважды.
 */
export function stageOf(skills: readonly SkillRecord[]): LearningStage {
  let hasRecognition = false
  let hasCuedRecall = false
  for (const skill of skills) {
    if (skill.dimension === 'vocab:ru-pl-input') return 'production'
    if (skill.dimension === 'vocab:ru-pl-choice') hasCuedRecall = true
    if (skill.dimension === 'vocab:pl-ru') hasRecognition = true
  }
  if (hasCuedRecall) return 'cued-recall'
  return hasRecognition ? 'recognition' : 'not-started'
}
