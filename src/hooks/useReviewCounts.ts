/**
 * `useReviewCounts` (`spec/tasks/23-stats.md`) — live "Сегодня / Завтра / 7 дней" counters
 * for the `/stats` screen (FR-123).
 *
 * Thin `useLiveQuery` wrapper around `stats.repository.ts#getReviewCounts`, same shape as
 * `useDueCount.ts` (task 05/11): `now` is captured once via `useState`'s lazy initializer,
 * not read fresh in the render body (`react-hooks/purity`), and both hooks call the exact
 * same `skills.repository.ts#countDue` under the hood for "today" — so the stats screen's
 * number and the home screen's "Повторить N" badge agree by construction, not coincidence
 * (acceptance point 3).
 */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getReviewCounts, type ReviewCounts } from '@/db/repositories/stats.repository.ts'

export function useReviewCounts(now?: number): ReviewCounts | undefined {
  const [mountedAt] = useState(() => Date.now())
  const effectiveNow = now ?? mountedAt
  return useLiveQuery(() => getReviewCounts(effectiveNow), [effectiveNow])
}
