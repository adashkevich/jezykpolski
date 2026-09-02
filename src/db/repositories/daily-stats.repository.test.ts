/**
 * `daily-stats.repository.ts` tests (`spec/tasks/15-home-screen.md` §3).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { getDailyStats } from './daily-stats.repository.ts'
import type { DailyStatsRecord } from '@/types/progress.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('getDailyStats', () => {
  it('returns undefined for a date with no row', async () => {
    expect(await getDailyStats('2026-09-01')).toBeUndefined()
  })

  it('returns the exact row for the given date key', async () => {
    const record: DailyStatsRecord = {
      date: '2026-09-01',
      reviewsCount: 42,
      correctCount: 37,
      newSkillsStarted: 18,
      sessionsCount: 3,
      timeSpentMs: 120_000,
      updatedAt: 1000,
    }
    await db.dailyStats.put(record)

    expect(await getDailyStats('2026-09-01')).toEqual(record)
    expect(await getDailyStats('2026-09-02')).toBeUndefined()
  })
})
