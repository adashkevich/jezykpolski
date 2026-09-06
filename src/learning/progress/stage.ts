/**
 * Этап изучения слова (`spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §2,
 * FR-80/FR-81/FR-83, `spec/architecture.md` §5.4/§7.2).
 *
 * У перевода ровно два этапа, и оба выражены существующими навыками — новых полей в БД не
 * появляется:
 *
 *   этап 1 — `vocab:pl-ru`, узнавание: выбрать значение из списка;
 *   этап 2 — `vocab:ru-pl`, воспроизведение: написать слово по-польски.
 *
 * Этап 2 существует ровно тогда, когда у `vocab:ru-pl` есть `SkillRecord` (architecture.md
 * §5.2's lazy materialization читается здесь как «навык открыт»): до этого момента
 * планировщик физически не может его выдать, потому что `getDueSkills` смотрит только на
 * существующие записи. `shouldUnlockProduction` — единственное место, где решается, когда
 * запись создавать.
 *
 * Чистый домен: ни React, ни Dexie, ни `features/**` (architecture.md §3).
 */
import type { SkillRecord } from '@/types/progress.ts'

export type LearningStage =
  /** Нет ни одной записи vocab-навыка — слово ещё не начинали. */
  | 'not-started'
  /** Идёт этап 1: есть `vocab:pl-ru`, но `vocab:ru-pl` ещё не открыт. Слово узнаётся в
   *  списке, но написать его пользователь не пробовал — это часть владения словом, но не
   *  всё (FR-83). */
  | 'recognition'
  /** Этап 2 открыт: `vocab:ru-pl` существует, слово тренируется на написание. */
  | 'production'

/**
 * Пора ли открывать этап 2 для слова, чей `vocab:pl-ru` только что получил оценку.
 *
 * Условие — `state === 'review'`, т.е. навык узнавания выпустился из learning. С
 * `learning_steps: ['10m']` (`learning/srs/fsrs-adapter.ts`, там же объяснено, почему шаг
 * ровно один) первый же верный `choice` даёт рейтинг `Good` и сразу графадуирует навык —
 * это и есть «этап 1 засчитан». Ошибочный или «трудный» ответ оставляет навык в
 * `learning`/`relearning`, и этап 2 не открывается, пока узнавание не устоится.
 *
 * Функция намеренно принимает *уже обновлённое* состояние навыка (то, что вызывающая
 * сторона собирается записать), а не читает БД сама.
 */
export function shouldUnlockProduction(recognition: SkillRecord | undefined): boolean {
  return recognition?.state === 'review'
}

/**
 * Этап слова по его записям навыков. На вход можно отдавать все записи слова — не-vocab
 * отфильтровываются здесь же, чтобы вызывающим сторонам (`progress/aggregate.ts`) не
 * приходилось делать это дважды.
 */
export function stageOf(skills: readonly SkillRecord[]): LearningStage {
  let hasRecognition = false
  for (const skill of skills) {
    if (skill.dimension === 'vocab:ru-pl') return 'production'
    if (skill.dimension === 'vocab:pl-ru') hasRecognition = true
  }
  return hasRecognition ? 'recognition' : 'not-started'
}
