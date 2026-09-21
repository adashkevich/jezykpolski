/**
 * «Точность» — единое определение (`spec/tasks/45-accuracy-counts-first-clean-answer.md`,
 * FR-86): верным считается только ответ, данный ЧИСТО и с ПЕРВОЙ попытки в сессии. Ошибка при
 * наборе понижает точность, даже если слово потом исправлено той же попыткой или верно отвечено
 * при повторе в той же сессии.
 *
 * Корень задачи: `gradeResult.correct` / `ReviewLogRecord.correct` значит «ответ в итоге
 * совпал», а не «ответил сам и сразу». Для SRS это правильно (рейтинг набора с ошибкой и так
 * опущен до Hard), для точности — нет. Поэтому здесь три независимых понятия, и каждое живёт в
 * ОДНОМ месте:
 *
 *  - `isCleanAnswer` — решение в момент ответа (его же берёт «Знаю», задача 41 §1, и запись
 *    `ReviewLogRecord.clean` в `answer-pipeline.ts#submitAnswer`);
 *  - `isCleanLog` / `isFirstInSessionLog` — чтение уже записанного лога, с запасным правилом для
 *    старых логов, у которых новых полей нет;
 *  - `dailyAccuracyPercent` — процент за день по `DailyStatsRecord`, с запасной прежней формулой
 *    для дней, записанных до задачи 45.
 *
 * `SkillRecord.correct/incorrect/correctStreak`, рейтинги и SRS эта логика не трогает.
 *
 * Чистый модуль: ни React, ни Dexie (`src/learning/**`, `architecture.md` §3).
 */
import { isFlawlessAttempt, type TypedAttemptOutcome } from '@/learning/exercises/letter-attempt.ts'
import { HARD } from '@/learning/srs/policy.ts'
import type { DailyStatsRecord, ReviewLogRecord } from '@/types/progress.ts'

/**
 * Ответ чистый (§1): выбор — `result.correct`; набор — `correct` И безупречная попытка
 * (`isFlawlessAttempt`: ноль ошибок, ноль подсказок, без «глазка»); near-miss таблиц не чистый
 * (`grade()` сообщает `correct: false` для него). Ответы без `attempt` (выбор из вариантов,
 * ячейки таблиц) чисты по построению, если `correct` — то же правило, по которому
 * `ExerciseFeedback` называет такой ответ «Верно!».
 */
export function isCleanAnswer(
  result: { readonly correct: boolean },
  attempt?: Pick<TypedAttemptOutcome, 'mistakes' | 'hintsUsed' | 'revealed'>,
): boolean {
  return result.correct && (attempt === undefined || isFlawlessAttempt(attempt))
}

/** Чистый ли записанный ответ. У логов без поля `clean` (старее задачи 45): `correct` и рейтинг
 *  не Hard — Hard в этом приложении получают ровно верные ответы «с ошибкой/подсказкой»
 *  (`policy.ts#mapResultToRating`) и near-miss. */
export function isCleanLog(log: Pick<ReviewLogRecord, 'correct' | 'rating' | 'clean'>): boolean {
  return log.clean ?? (log.correct && log.rating !== HARD)
}

/** Первый ли это ответ на навык в сессии. У логов без поля `firstInSession`: `srsApplied`
 *  (`policy.ts#shouldApplySrs`) — совпадает с «первым ответом» везде, кроме режима `mistakes`
 *  (там `srsApplied` всегда `false`); для старых данных допустимое приближение. */
export function isFirstInSessionLog(
  log: Pick<ReviewLogRecord, 'srsApplied' | 'firstInSession'>,
): boolean {
  return log.firstInSession ?? log.srsApplied
}

/** По одной строке на `skillId` — лог с самым ранним `reviewedAt`, то есть тот самый ответ, с
 *  которого `stores/session.store.ts#recordAnswer` во время живой сессии заполнял
 *  `firstAnswerBySkill`/`mistakes`. Вход не мутируется. */
export function firstLogsBySkill<T extends Pick<ReviewLogRecord, 'skillId' | 'reviewedAt'>>(
  logs: readonly T[],
): T[] {
  const bySkill = new Map<string, T>()
  for (const log of [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    if (!bySkill.has(log.skillId)) bySkill.set(log.skillId, log)
  }
  return [...bySkill.values()]
}

/** Итог сессии по её логам: сколько навыков получили первый ответ и сколько из них чистых —
 *  `SessionRecord.totalCount/correctCount`. Повторы после ошибки в счёт не входят. */
export function summarizeFirstAnswers(
  logs: readonly Pick<ReviewLogRecord, 'skillId' | 'reviewedAt' | 'correct' | 'rating' | 'clean'>[],
): { readonly totalCount: number; readonly correctCount: number } {
  const first = firstLogsBySkill(logs)
  return { totalCount: first.length, correctCount: first.filter(isCleanLog).length }
}

/**
 * «Точность за сегодня», целые проценты; `null` — нечего показывать. День с новыми счётчиками
 * (`accuracyAttempts > 0`) — `accuracyClean / accuracyAttempts`. День, у которого их нет (записан
 * до задачи 45, задним числом не пересчитывается), — прежняя `correctCount / reviewsCount`: она
 * считает и повторы, но старые дни показывают старую точность (§«Границы»).
 */
export function dailyAccuracyPercent(
  stats:
    | Pick<
        DailyStatsRecord,
        'reviewsCount' | 'correctCount' | 'accuracyAttempts' | 'accuracyClean'
      >
    | undefined,
): number | null {
  if (!stats) return null
  const attempts = stats.accuracyAttempts ?? 0
  if (attempts > 0) return Math.round(((stats.accuracyClean ?? 0) / attempts) * 100)
  return stats.reviewsCount > 0 ? Math.round((stats.correctCount / stats.reviewsCount) * 100) : null
}
