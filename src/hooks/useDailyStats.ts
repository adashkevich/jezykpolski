/**
 * `useDailyStats` (`spec/tasks/15-home-screen.md` §3) — live "Сегодня" summary for the home
 * screen (`dailyStats` row for one local-calendar-day key).
 *
 * Built on `useLiveQuery` so the home screen's "Сегодня" block updates itself the instant a
 * session finishes writing (`applyAnswer`/`completeSession` both touch `dailyStats`), with
 * no manual refetch (this task's acceptance point 4) — the same pattern as `useDueCount.ts`
 * and `useWordProgress.ts`.
 *
 * `undefined` means "no `dailyStats` row for this day yet" (nothing recorded — a legitimate
 * state on a fresh install or any day with zero activity) OR "still loading", the same
 * unavoidable ambiguity `useWordProgress.ts`'s header already documents for a single word's
 * progress; callers should just treat it as "nothing to show yet" and render zeros.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getDailyStats } from '@/db/repositories/daily-stats.repository.ts'
import type { DailyStatsRecord } from '@/types/progress.ts'

export function useDailyStats(date: string): DailyStatsRecord | undefined {
  return useLiveQuery(() => getDailyStats(date), [date])
}
