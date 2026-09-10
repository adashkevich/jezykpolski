/**
 * `PolishLearningDatabase` schema tests (`spec/tasks/05-persistence.md` acceptance point 1:
 * "БД создаётся при первом запуске, версия 1"; bumped to version 2 by
 * `spec/tasks/37-three-stage-vocabulary.md` §3 — see `legacy-vocab-migration.test.ts` for
 * that migration's own rename/backfill behavior).
 */
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { db, PolishLearningDatabase } from './database.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'

afterEach(async () => {
  await db.delete()
})

describe('PolishLearningDatabase', () => {
  it('opens successfully and reports version 2', async () => {
    await db.open()
    expect(db.verno).toBe(2)
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

// ---------------------------------------------------------------------------
// version(2) — task 37's rename/backfill migration (`legacy-vocab-migration.ts`'s own
// header explains the split: this exercises the real Dexie upgrade path end to end, while
// `legacy-vocab-migration.test.ts` covers the pure transform functions in isolation).
// ---------------------------------------------------------------------------

function legacySkill(overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId' | 'dimension'>): SkillRecord {
  return {
    kind: 'vocab',
    state: 'review',
    stability: 1,
    difficulty: 5,
    due: 0,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function legacyReviewLog(overrides: Partial<ReviewLogRecord> & Pick<ReviewLogRecord, 'skillId' | 'wordId'>): ReviewLogRecord {
  return {
    sessionId: 1,
    exerciseType: 'input',
    reviewedAt: 0,
    rating: 3,
    correct: true,
    answerGiven: 'kobieta',
    expected: 'kobieta',
    elapsedMs: 500,
    srsApplied: true,
    ...overrides,
  }
}

describe('version(2) migration — legacy vocab:ru-pl rename/backfill (task 37)', () => {
  it('renames skills/reviewLogs off the old dimension and backfills a vocab:ru-pl-choice sibling, leaving everything else untouched', async () => {
    const name = `legacy-migration-test-${Math.random().toString(36).slice(2)}`

    // Step 1: seed a version(1)-shaped database directly — bypassing `PolishLearningDatabase`
    // itself, which already declares version 2 and would upgrade on open before this test
    // ever got to see the "before" shape.
    const legacyDb = new Dexie(name)
    legacyDb.version(1).stores({
      skills: 'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
      wordProgress: 'wordId, status, nextDue, updatedAt',
      reviewLogs: '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
      sessions: '++id, mode, startedAt, endedAt',
      dailyStats: 'date',
      settings: 'key',
      meta: 'key',
    })
    await legacyDb.open()
    await legacyDb.table<SkillRecord, string>('skills').bulkAdd([
      legacySkill({
        skillId: 'kobieta|NOUN::vocab:pl-ru',
        wordId: 'kobieta|NOUN',
        dimension: 'vocab:pl-ru',
        stability: 30,
      }),
      legacySkill({
        skillId: 'kobieta|NOUN::vocab:ru-pl',
        wordId: 'kobieta|NOUN',
        dimension: 'vocab:ru-pl',
        stability: 25,
        reps: 5,
        lapses: 1,
        correct: 5,
        incorrect: 1,
      }),
      legacySkill({
        skillId: 'kobieta|NOUN::noun:sg:genitive',
        wordId: 'kobieta|NOUN',
        dimension: 'noun:sg:genitive',
        kind: 'noun',
        state: 'learning',
        stability: 2,
      }),
    ])
    await legacyDb.table<ReviewLogRecord, number>('reviewLogs').bulkAdd([
      legacyReviewLog({ skillId: 'kobieta|NOUN::vocab:pl-ru', wordId: 'kobieta|NOUN', reviewedAt: 50 }),
      legacyReviewLog({ skillId: 'kobieta|NOUN::vocab:ru-pl', wordId: 'kobieta|NOUN', reviewedAt: 100 }),
    ])
    legacyDb.close()

    // Step 2: open the SAME database name with the real app schema (declares version 1 AND
    // 2) — Dexie detects the stored version is 1 and runs the version(2) upgrade itself.
    const migrated = new PolishLearningDatabase(name)
    await migrated.open()
    expect(migrated.verno).toBe(2)

    const skills = await migrated.skills.toArray()
    const byDimension = new Map(skills.map((s) => [s.dimension, s]))
    expect(byDimension.has('vocab:ru-pl')).toBe(false)
    expect(skills).toHaveLength(4) // pl-ru, ru-pl-choice (backfilled), ru-pl-input (renamed), noun

    const input = byDimension.get('vocab:ru-pl-input')!
    expect(input.skillId).toBe('kobieta|NOUN::vocab:ru-pl-input')
    expect(input.stability).toBe(25) // same SRS state as the old vocab:ru-pl row
    expect(input.reps).toBe(5)
    expect(input.correct).toBe(5)

    const choice = byDimension.get('vocab:ru-pl-choice')!
    expect(choice.skillId).toBe('kobieta|NOUN::vocab:ru-pl-choice')
    expect(choice.stability).toBe(25) // backfilled as a COPY, not a fresh "new" row
    expect(choice.state).toBe('review')

    // Unrelated rows pass through completely untouched.
    expect(byDimension.get('vocab:pl-ru')?.stability).toBe(30)
    expect(byDimension.get('noun:sg:genitive')?.stability).toBe(2)

    const logs = await migrated.reviewLogs.toArray()
    expect(logs.map((l) => l.skillId).sort()).toEqual([
      'kobieta|NOUN::vocab:pl-ru',
      'kobieta|NOUN::vocab:ru-pl-input',
    ])

    migrated.close()
    await migrated.delete()
  })

  it('is a no-op for a database with no legacy vocab:ru-pl rows', async () => {
    const name = `legacy-migration-noop-${Math.random().toString(36).slice(2)}`
    const legacyDb = new Dexie(name)
    legacyDb.version(1).stores({
      skills: 'skillId, wordId, kind, due, state, [kind+due], [wordId+kind], updatedAt',
      wordProgress: 'wordId, status, nextDue, updatedAt',
      reviewLogs: '++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]',
      sessions: '++id, mode, startedAt, endedAt',
      dailyStats: 'date',
      settings: 'key',
      meta: 'key',
    })
    await legacyDb.open()
    await legacyDb.table<SkillRecord, string>('skills').add(
      legacySkill({ skillId: 'kobieta|NOUN::vocab:pl-ru', wordId: 'kobieta|NOUN', dimension: 'vocab:pl-ru' }),
    )
    legacyDb.close()

    const migrated = new PolishLearningDatabase(name)
    await migrated.open()
    const skills = await migrated.skills.toArray()
    expect(skills.map((s) => s.dimension)).toEqual(['vocab:pl-ru'])

    migrated.close()
    await migrated.delete()
  })
})
