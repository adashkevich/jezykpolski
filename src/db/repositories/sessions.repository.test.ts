/**
 * `sessions.repository.ts` (`spec/tasks/13-session-runner.md` §5/§6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import {
  completeSession,
  createSession,
  deleteSession,
  getIncompleteSession,
  getSession,
} from './sessions.repository.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('createSession / getSession', () => {
  it('creates a zeroed-out row with no endedAt', async () => {
    const id = await createSession('learn', 1000)
    const session = await getSession(id)
    expect(session).toEqual({
      id,
      mode: 'learn',
      startedAt: 1000,
      totalCount: 0,
      correctCount: 0,
      newSkillCount: 0,
      reviewedSkillCount: 0,
    })
  })
})

describe('completeSession', () => {
  it('writes endedAt and the final tallies', async () => {
    const id = await createSession('learn', 1000)
    await completeSession(id, 2000, {
      totalCount: 20,
      correctCount: 18,
      newSkillCount: 6,
      reviewedSkillCount: 14,
    })
    const session = await getSession(id)
    expect(session).toEqual({
      id,
      mode: 'learn',
      startedAt: 1000,
      endedAt: 2000,
      totalCount: 20,
      correctCount: 18,
      newSkillCount: 6,
      reviewedSkillCount: 14,
    })
  })
})

describe('getIncompleteSession', () => {
  it('returns undefined when there is no session at all', async () => {
    expect(await getIncompleteSession()).toBeUndefined()
  })

  it('returns undefined once the only session has been completed', async () => {
    const id = await createSession('learn', 1000)
    await completeSession(id, 2000, {
      totalCount: 1,
      correctCount: 1,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    expect(await getIncompleteSession()).toBeUndefined()
  })

  it('returns the most recent session that has no endedAt', async () => {
    const older = await createSession('learn', 1000)
    await completeSession(older, 1500, {
      totalCount: 1,
      correctCount: 1,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    const newer = await createSession('learn', 2000)

    const incomplete = await getIncompleteSession()
    expect(incomplete?.id).toBe(newer)
    expect(incomplete?.endedAt).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// deleteSession (task 14, acceptance point 8 — zero-answer sessions leave no trace).
// ---------------------------------------------------------------------------

describe('deleteSession', () => {
  it('removes the row outright — not a soft-complete', async () => {
    const id = await createSession('learn', 1000)
    await deleteSession(id)
    expect(await getSession(id)).toBeUndefined()
    expect(await getIncompleteSession()).toBeUndefined()
  })

  it('is safe to call on an id that never existed', async () => {
    await expect(deleteSession(999_999)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// completeSession's dailyStats.sessionsCount bump (task 14 §3, acceptance point 7 — must
// bucket by the LOCAL calendar day of `endedAt`, including the midnight-straddling case).
// ---------------------------------------------------------------------------

describe('completeSession — dailyStats.sessionsCount', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a fresh dailyStats row with sessionsCount 1 for a session with no prior stats that day', async () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const endedAt = Date.UTC(2026, 8, 1, 10, 0, 0) // clearly Sept 1 in Warsaw
    const id = await createSession('learn', endedAt - 60_000)
    await completeSession(id, endedAt, {
      totalCount: 5,
      correctCount: 4,
      newSkillCount: 1,
      reviewedSkillCount: 4,
    })

    const stats = await db.dailyStats.get('2026-09-01')
    expect(stats?.sessionsCount).toBe(1)
  })

  it('increments an existing day\'s sessionsCount without disturbing its other fields', async () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const endedAt = Date.UTC(2026, 8, 1, 10, 0, 0)
    await db.dailyStats.put({
      date: '2026-09-01',
      reviewsCount: 20,
      correctCount: 18,
      newSkillsStarted: 3,
      sessionsCount: 1,
      timeSpentMs: 60_000,
      updatedAt: endedAt - 1000,
    })

    const id = await createSession('learn', endedAt - 60_000)
    await completeSession(id, endedAt, {
      totalCount: 5,
      correctCount: 4,
      newSkillCount: 0,
      reviewedSkillCount: 5,
    })

    const stats = await db.dailyStats.get('2026-09-01')
    expect(stats).toMatchObject({
      sessionsCount: 2,
      reviewsCount: 20,
      correctCount: 18,
      newSkillsStarted: 3,
      timeSpentMs: 60_000,
    })
  })

  it('a session ending just after local midnight is credited to the NEXT day, not the day it started', async () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    // Warsaw is UTC+2 in September (CEST) — 22:30 UTC on Sept 1 is 00:30 local on Sept 2.
    const startedAt = Date.UTC(2026, 8, 1, 22, 0, 0)
    const endedAt = Date.UTC(2026, 8, 1, 22, 30, 0)
    const id = await createSession('learn', startedAt)
    await completeSession(id, endedAt, {
      totalCount: 3,
      correctCount: 3,
      newSkillCount: 0,
      reviewedSkillCount: 3,
    })

    expect(await db.dailyStats.get('2026-09-01')).toBeUndefined()
    const nextDay = await db.dailyStats.get('2026-09-02')
    expect(nextDay?.sessionsCount).toBe(1)
  })

  it('calling completeSession twice for the same session only counts sessionsCount once', async () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const endedAt = Date.UTC(2026, 8, 1, 10, 0, 0)
    const id = await createSession('learn', endedAt - 60_000)
    const summary = { totalCount: 2, correctCount: 2, newSkillCount: 0, reviewedSkillCount: 2 }
    await completeSession(id, endedAt, summary)
    await completeSession(id, endedAt, summary) // defensive double-call

    const stats = await db.dailyStats.get('2026-09-01')
    expect(stats?.sessionsCount).toBe(1)
  })
})
