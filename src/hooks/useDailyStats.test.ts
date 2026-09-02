/**
 * `useDailyStats` tests (`spec/tasks/15-home-screen.md` §3, "Сегодня" block).
 *
 * Fixture data goes through the real `createSession`/`completeSession` repository functions
 * (`sessions.repository.ts`, task 13/14) — the only public way this test file (outside
 * `src/db/**`, so held to the same `no-restricted-imports` rule as any consumer) can write a
 * `dailyStats` row. `completeSession` only bumps `sessionsCount`, which is enough to prove
 * the hook reads the right date key and re-renders live on a `dailyStats` write — the full
 * per-answer field set (`reviewsCount`/`correctCount`/`newSkillsStarted`) is
 * `answer.repository.test.ts`'s job, not this thin `useLiveQuery` wrapper's.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useDailyStats } from './useDailyStats.ts'
import { completeSession, createSession } from '@/db/repositories/sessions.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { toLocalDateKey } from '@/lib/dates.ts'

afterEach(async () => {
  cleanup()
  await deleteDatabase()
})

describe('useDailyStats', () => {
  it('is undefined for a day with no recorded activity', async () => {
    await openDatabase()

    const { result } = renderHook(() => useDailyStats('2026-09-01'))
    await waitFor(() => expect(result.current).toBeUndefined())
  })

  it('reflects the dailyStats row for the given local-calendar-day key', async () => {
    await openDatabase()
    const endedAt = new Date('2026-09-01T12:00:00').getTime()
    const dateKey = toLocalDateKey(endedAt)
    const id = await createSession('learn', endedAt - 1000)
    await completeSession(id, endedAt, {
      totalCount: 5,
      correctCount: 4,
      newSkillCount: 2,
      reviewedSkillCount: 3,
    })

    const { result } = renderHook(() => useDailyStats(dateKey))
    await waitFor(() => expect(result.current?.sessionsCount).toBe(1))

    // A different day's key must not pick up this row.
    const { result: otherDay } = renderHook(() => useDailyStats('2099-01-01'))
    await waitFor(() => expect(otherDay.current).toBeUndefined())
  })

  it('is live: a second completed session on the same day bumps sessionsCount without a manual refetch', async () => {
    await openDatabase()
    const endedAt = new Date('2026-09-01T09:00:00').getTime()
    const dateKey = toLocalDateKey(endedAt)

    const { result } = renderHook(() => useDailyStats(dateKey))
    await waitFor(() => expect(result.current).toBeUndefined())

    const firstId = await createSession('learn', endedAt - 1000)
    await completeSession(firstId, endedAt, {
      totalCount: 1,
      correctCount: 1,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    await waitFor(() => expect(result.current?.sessionsCount).toBe(1))

    const secondEndedAt = endedAt + 60_000
    const secondId = await createSession('learn', secondEndedAt - 1000)
    await completeSession(secondId, secondEndedAt, {
      totalCount: 1,
      correctCount: 0,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    await waitFor(() => expect(result.current?.sessionsCount).toBe(2))
  })
})
