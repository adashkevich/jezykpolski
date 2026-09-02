/**
 * `dailyStats` read access (`spec/tasks/15-home-screen.md` §3, "Сегодня" block).
 *
 * The table is written elsewhere — `answer.repository.ts#applyAnswer` (per-answer counters)
 * and `sessions.repository.ts#completeSession` (`sessionsCount`) — both inside `src/db/**`,
 * so they reach `db.dailyStats` directly. This file exists so the one remaining
 * consumer, a plain read of "today's row", also goes through `src/db/repositories/**`
 * rather than a component importing `db/database.ts` directly (NFR-12; `eslint.config.js`'s
 * `no-restricted-imports` rule blocks that import outside `src/db/**` anyway).
 */
import { db } from '../database.ts'
import type { DailyStatsRecord } from '@/types/progress.ts'

/** `date` is a `YYYY-MM-DD` local-calendar-day key (`lib/dates.ts#toLocalDateKey`).
 *  `undefined` when no answer/session has been recorded for that day yet — a legitimate
 *  "nothing happened today" state, not an error. */
export async function getDailyStats(date: string): Promise<DailyStatsRecord | undefined> {
  return db.dailyStats.get(date)
}
