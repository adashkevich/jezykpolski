import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import { deleteDatabase, openDatabase, resetLocalState } from './lifecycle.repository.ts'

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

describe('resetLocalState', () => {
  // jsdom (this test's environment) has neither `caches` (Cache Storage) nor
  // `navigator.serviceWorker` — the same absence a very old/locked-down real browser could
  // have. `resetLocalState`'s `typeof caches !== 'undefined'` / `navigator.serviceWorker`
  // guards exist precisely so those steps are skipped rather than throwing, which these tests
  // exercise for free simply by running under jsdom.

  it('deletes the database — a subsequent open recreates a fresh empty db', async () => {
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

    await resetLocalState()
    expect(db.isOpen()).toBe(false)

    await openDatabase()
    expect(await db.skills.count()).toBe(0)
  })

  it('resolves even when db.delete() never settles (onblocked in another tab)', async () => {
    await openDatabase()
    // `db.delete()`'s real return type is Dexie's `PromiseExtended<void>` (a `Promise` plus
    // extra Dexie-only methods); a plain never-resolving `Promise` satisfies everything
    // `resetLocalState`'s `Promise.race` actually awaits, so the cast is safe.
    vi.spyOn(db, 'delete').mockReturnValueOnce(
      new Promise<void>(() => {}) as ReturnType<typeof db.delete>,
    )

    // Small explicit timeout so this exercises the timeout-race branch without a real 5s wait.
    await expect(resetLocalState(20)).resolves.toBeUndefined()
  })

  it('resolves even when db.delete() rejects', async () => {
    await openDatabase()
    vi.spyOn(db, 'delete').mockRejectedValueOnce(new Error('simulated delete failure'))

    await expect(resetLocalState()).resolves.toBeUndefined()
  })
})
