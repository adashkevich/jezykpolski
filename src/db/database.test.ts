/**
 * `PolishLearningDatabase` schema tests (`spec/tasks/05-persistence.md` acceptance point 1:
 * "БД создаётся при первом запуске, версия 1").
 */
import { afterEach, describe, expect, it } from 'vitest'
import { db, PolishLearningDatabase } from './database.ts'

afterEach(async () => {
  await db.delete()
})

describe('PolishLearningDatabase', () => {
  it('opens successfully and reports version 1', async () => {
    await db.open()
    expect(db.verno).toBe(1)
    expect(db.isOpen()).toBe(true)
  })

  it('declares exactly the tables from architecture.md §8', async () => {
    await db.open()
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      ['dailyStats', 'meta', 'reviewLogs', 'sessions', 'settings', 'skills', 'wordProgress'].sort(),
    )
  })

  it('data survives closing and reopening the same named database (simulates page reload)', async () => {
    await db.open()
    await db.skills.add({
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'new',
      stability: 0,
      difficulty: 0,
      due: 1000,
      reps: 0,
      lapses: 0,
      correct: 0,
      incorrect: 0,
      createdAt: 1000,
      updatedAt: 1000,
    })
    db.close()

    // A fresh Dexie instance against the SAME underlying IndexedDB database name — this is
    // exactly what "survives a page reload" means for IndexedDB: a brand new JS heap, same
    // on-disk (well, in this test, same fake-indexeddb-backed) database.
    const reopened = new PolishLearningDatabase(db.name)
    await reopened.open()
    const row = await reopened.skills.get('kobieta|NOUN::vocab:pl-ru')
    expect(row?.wordId).toBe('kobieta|NOUN')
    reopened.close()
  })
})
