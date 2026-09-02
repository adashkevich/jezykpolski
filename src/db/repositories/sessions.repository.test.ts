/**
 * `sessions.repository.ts` (`spec/tasks/13-session-runner.md` §5/§6).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  completeSession,
  createSession,
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
