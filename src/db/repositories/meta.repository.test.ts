import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { getContentVersion, setContentVersion, syncContentVersion } from './meta.repository.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('meta.repository', () => {
  it('getContentVersion is undefined before anything is stored', async () => {
    expect(await getContentVersion()).toBeUndefined()
  })

  it('setContentVersion / getContentVersion round-trip', async () => {
    await setContentVersion('abcdef123456')
    expect(await getContentVersion()).toBe('abcdef123456')
  })

  it('syncContentVersion writes and reports true when the version differs (including unset)', async () => {
    expect(await syncContentVersion('v1')).toBe(true)
    expect(await getContentVersion()).toBe('v1')

    expect(await syncContentVersion('v2')).toBe(true)
    expect(await getContentVersion()).toBe('v2')
  })

  it('syncContentVersion is a no-op and reports false when the version already matches', async () => {
    await setContentVersion('v1')
    expect(await syncContentVersion('v1')).toBe(false)
    expect(await getContentVersion()).toBe('v1')
  })

  it('a content-version bump never touches skills/wordProgress (progress is not reset)', async () => {
    await db.skills.add({
      skillId: 'a|NOUN::vocab:pl-ru',
      wordId: 'a|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 10,
      difficulty: 5,
      due: 100,
      reps: 3,
      lapses: 0,
      correct: 3,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    })
    await syncContentVersion('v2')
    expect(await db.skills.count()).toBe(1)
  })
})
