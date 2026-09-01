import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import { deleteDatabase, openDatabase } from './lifecycle.repository.ts'

afterEach(async () => {
  vi.restoreAllMocks()
  if (db.isOpen()) db.close()
  await db.delete().catch(() => {})
})

describe('lifecycle.repository', () => {
  it('openDatabase opens the db and resolves with it', async () => {
    const opened = await openDatabase()
    expect(opened.isOpen()).toBe(true)
    expect(opened).toBe(db)
  })

  it('openDatabase wraps a failure with a human-readable Polish message and preserves cause', async () => {
    const original = new Error('boom: quota exceeded')
    vi.spyOn(db, 'open').mockRejectedValueOnce(original)
    await expect(openDatabase()).rejects.toThrow(/lokalnej bazy danych/)

    vi.spyOn(db, 'open').mockRejectedValueOnce(original)
    await expect(openDatabase()).rejects.toMatchObject({ cause: original })
  })

  it('deleteDatabase closes and deletes — a subsequent open recreates a fresh empty db', async () => {
    await openDatabase()
    await db.skills.add({
      skillId: 'a|NOUN::vocab:pl-ru',
      wordId: 'a|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'new',
      stability: 0,
      difficulty: 0,
      due: 0,
      reps: 0,
      lapses: 0,
      correct: 0,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    await deleteDatabase()
    expect(db.isOpen()).toBe(false)

    await openDatabase()
    expect(await db.skills.count()).toBe(0)
  })
})
