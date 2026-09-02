import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { getLogsForSession, getLogsForWord, getLogsSince, logReview } from './reviews.repository.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

function log(
  overrides: Partial<ReviewLogRecord> & Pick<ReviewLogRecord, 'wordId' | 'reviewedAt'>,
): Omit<ReviewLogRecord, 'id'> {
  return {
    sessionId: 1,
    skillId: `${overrides.wordId}::vocab:pl-ru`,
    exerciseType: 'translate',
    rating: 3,
    correct: true,
    answerGiven: 'x',
    expected: 'x',
    elapsedMs: 100,
    srsApplied: true,
    ...overrides,
  }
}

describe('reviews.repository', () => {
  it('logReview returns the assigned auto-increment id', async () => {
    const id1 = await logReview(log({ wordId: 'a|NOUN', reviewedAt: 1 }))
    const id2 = await logReview(log({ wordId: 'a|NOUN', reviewedAt: 2 }))
    expect(id2).toBeGreaterThan(id1)
  })

  it("getLogsForWord returns only that word's logs, most recent first", async () => {
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 100 }))
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 300 }))
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 200 }))
    await logReview(log({ wordId: 'b|NOUN', reviewedAt: 150 }))

    const rows = await getLogsForWord('a|NOUN', 10)
    expect(rows.map((r) => r.reviewedAt)).toEqual([300, 200, 100])
  })

  it('getLogsForWord respects the limit', async () => {
    for (let i = 0; i < 5; i++) await logReview(log({ wordId: 'a|NOUN', reviewedAt: i }))
    const rows = await getLogsForWord('a|NOUN', 2)
    expect(rows).toHaveLength(2)
  })

  it('getLogsForSession filters by sessionId', async () => {
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 1, sessionId: 1 }))
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 2, sessionId: 2 }))
    const rows = await getLogsForSession(2)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.reviewedAt).toBe(2)
  })

  it('getLogsSince filters by reviewedAt >= ts', async () => {
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 100 }))
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 200 }))
    await logReview(log({ wordId: 'a|NOUN', reviewedAt: 300 }))
    const rows = await getLogsSince(200)
    expect(rows.map((r) => r.reviewedAt).sort()).toEqual([200, 300])
  })

  it('never deletes: no delete API is exposed by this module', () => {
    const mod = { getLogsForWord, getLogsForSession, getLogsSince, logReview } as Record<
      string,
      unknown
    >
    expect(Object.keys(mod).some((k) => /delete|remove|clear/i.test(k))).toBe(false)
  })
})
