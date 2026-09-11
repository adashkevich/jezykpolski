/**
 * Этап изучения слова (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2,
 * FR-80/FR-81/FR-83, extended by `spec/tasks/37-three-stage-vocabulary.md` §1-2,
 * `spec/architecture.md` §5.4/§7.2).
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
 * Задача 28 держала переход 1→2 на `state === 'review'` — один верный ответ, потому что
 * `learning_steps: ['10m']` графадуирует навык с первого же Good. Задача 37 явно усложняет
 * оба перехода: вместо состояния — порог накопленной стабильности FSRS
 * (`RECOGNITION_UNLOCK_STABILITY_DAYS` / `CUED_RECALL_UNLOCK_STABILITY_DAYS` ниже), то есть
 * несколько успешных повторений подряд, а не один. Один и тот же механизм на обе ступени —
 * вместо отдельного правила под каждую.
 *
 * Каждый следующий этап существует ровно тогда, когда у соответствующего навыка есть
 * `SkillRecord` (architecture.md §5.2's lazy materialization читается здесь как «навык
 * открыт»): до этого момента планировщик физически не может его выдать, потому что
 * `getDueSkills` смотрит только на существующие записи. `shouldUnlockCuedRecall` /
 * `shouldUnlockProduction` — единственные места, где решается, когда запись создавать.
 *
 * Чистый домен: ни React, ни Dexie, ни `features/**` (architecture.md §3).
 */
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
 *  (`vocab:ru-pl-choice`). При дефолтных весах FSRS первый Good на новой карте даёт
 *  stability ≈ 2.3 дня, второй ≈ 6-7 — то есть порог в 7 требует двух-трёх успешных
 *  повторений примерно за неделю, вместо одного ответа, как было до задачи 37. */
export const RECOGNITION_UNLOCK_STABILITY_DAYS = 7

/** Тот же порог для перехода 2→3 (`vocab:ru-pl-choice` -> `vocab:ru-pl-input`). Взят
 *  чуть выше `RECOGNITION_UNLOCK_STABILITY_DAYS`, а не равным ему: переход к свободному
 *  воспроизведению — более серьёзный шаг, чем переход к узнаванию на другом языке, и
 *  заслуживает на одно повторение больше (третий Good на новой карте даёт stability ≈
 *  15-20 дней, так что порог в 10 всё ещё держит в рамках "пара недель", а не месяц). */
export const CUED_RECALL_UNLOCK_STABILITY_DAYS = 10

/**
 * Пора ли открывать этап 2 для слова, чей `vocab:pl-ru` только что получил оценку.
 *
 * Функция намеренно принимает *уже обновлённое* состояние навыка (то, что вызывающая
 * сторона собирается записать), а не читает БД сама — тот же контракт, что и у задачи 28's
 * `shouldUnlockProduction`, просто теперь по стабильности, а не по состоянию.
 *
 * Сознательно не проверяет `state` отдельно: у FSRS стабильность не обнуляется при
 * `Again`/`Hard`, она лишь демпфируется, так что после месяцев уверенных повторений
 * случайная описка (`state` уходит в `relearning`) обычно не роняет стабильность ниже
 * порога. Открыть следующий этап на этом же ответе — не ошибка: слово по-прежнему хорошо
 * закреплено, единичный срыв ничего в этом не меняет. Порог — про накопленную уверенность,
 * а не про исход конкретного ответа.
 */
export function shouldUnlockCuedRecall(recognition: SkillRecord | undefined): boolean {
  return (recognition?.stability ?? 0) >= RECOGNITION_UNLOCK_STABILITY_DAYS
}

/** Пора ли открывать этап 3 для слова, чей `vocab:ru-pl-choice` только что получил оценку.
 *  Тот же принцип, что у `shouldUnlockCuedRecall` — принимает уже обновлённое состояние. */
export function shouldUnlockProduction(cuedRecall: SkillRecord | undefined): boolean {
  return (cuedRecall?.stability ?? 0) >= CUED_RECALL_UNLOCK_STABILITY_DAYS
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
