/**
 * `skills.repository.ts` tests (`spec/tasks/05-persistence.md` §2, acceptance points 2 & 3).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  countDue,
  countDueBetween,
  ensureSkill,
  getDueSkills,
  getSkill,
  getSkillsForWord,
  hasAnySkill,
  resetWord,
  upsertSkill,
} from './skills.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

function makeSkill(
  overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId'>,
): SkillRecord {
  return {
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 10,
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

describe('ensureSkill', () => {
  it('creates a fresh "new" skill on first call', async () => {
    const before = Date.now()
    const skill = await ensureSkill(
      'kobieta|NOUN::vocab:pl-ru',
      'kobieta|NOUN',
      'vocab',
      'vocab:pl-ru',
    )
    expect(skill.state).toBe('new')
    expect(skill.stability).toBe(0)
    expect(skill.reps).toBe(0)
    expect(skill.due).toBeGreaterThanOrEqual(before)

    const stored = await db.skills.get('kobieta|NOUN::vocab:pl-ru')
    expect(stored).toBeDefined()
  })

  it('is idempotent: a second call returns the SAME record and does not reset state', async () => {
    const first = await ensureSkill(
      'kobieta|NOUN::vocab:pl-ru',
      'kobieta|NOUN',
      'vocab',
      'vocab:pl-ru',
    )

    // Simulate the skill having since been reviewed (task 11 would do this via applyAnswer).
    await upsertSkill({ ...first, state: 'review', stability: 42, reps: 3, updatedAt: 999 })

    const second = await ensureSkill(
      'kobieta|NOUN::vocab:pl-ru',
      'kobieta|NOUN',
      'vocab',
      'vocab:pl-ru',
    )
    expect(second.state).toBe('review')
    expect(second.stability).toBe(42)
    expect(second.reps).toBe(3)

    const count = await db.skills.where('skillId').equals('kobieta|NOUN::vocab:pl-ru').count()
    expect(count).toBe(1)
  })

  it('concurrent calls for the same skillId never create a duplicate', async () => {
    const [a, b, c] = await Promise.all([
      ensureSkill('rower|NOUN::vocab:pl-ru', 'rower|NOUN', 'vocab', 'vocab:pl-ru'),
      ensureSkill('rower|NOUN::vocab:pl-ru', 'rower|NOUN', 'vocab', 'vocab:pl-ru'),
      ensureSkill('rower|NOUN::vocab:pl-ru', 'rower|NOUN', 'vocab', 'vocab:pl-ru'),
    ])
    expect(a.createdAt).toBe(b.createdAt)
    expect(b.createdAt).toBe(c.createdAt)
    const count = await db.skills.where('skillId').equals('rower|NOUN::vocab:pl-ru').count()
    expect(count).toBe(1)
  })
})

describe('getSkill / getSkillsForWord', () => {
  it('getSkill returns undefined for a never-materialized skill', async () => {
    expect(await getSkill('nope|NOUN::vocab:pl-ru')).toBeUndefined()
  })

  it('getSkillsForWord returns every skill for a word, nothing else', async () => {
    await db.skills.bulkAdd([
      makeSkill({ skillId: 'kobieta|NOUN::vocab:pl-ru', wordId: 'kobieta|NOUN' }),
      makeSkill({
        skillId: 'kobieta|NOUN::noun:sg:genitive',
        wordId: 'kobieta|NOUN',
        kind: 'noun',
      }),
      makeSkill({ skillId: 'rower|NOUN::vocab:pl-ru', wordId: 'rower|NOUN' }),
    ])
    const rows = await getSkillsForWord('kobieta|NOUN')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.wordId === 'kobieta|NOUN')).toBe(true)
  })
})

describe('resetWord', () => {
  it('deletes every skill for the word and its wordProgress cache row', async () => {
    await db.skills.bulkAdd([
      makeSkill({ skillId: 'kobieta|NOUN::vocab:pl-ru', wordId: 'kobieta|NOUN' }),
      makeSkill({
        skillId: 'kobieta|NOUN::noun:sg:genitive',
        wordId: 'kobieta|NOUN',
        kind: 'noun',
      }),
    ])
    await db.wordProgress.put({
      wordId: 'kobieta|NOUN',
      status: 'known',
      vocabMaturity: 0.5,
      morphMaturity: 0.5,
      updatedAt: 0,
    })

    await resetWord('kobieta|NOUN')

    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)
    expect(await db.wordProgress.get('kobieta|NOUN')).toBeUndefined()
  })
})

describe('countDue / countDueBetween', () => {
  it('counts skills due at or before `now`, optionally scoped by kind', async () => {
    await db.skills.bulkAdd([
      makeSkill({ skillId: 's1', wordId: 'w1', kind: 'vocab', due: 100 }),
      makeSkill({ skillId: 's2', wordId: 'w1', kind: 'noun', due: 200 }),
      makeSkill({ skillId: 's3', wordId: 'w2', kind: 'vocab', due: 5000 }),
    ])
    expect(await countDue(1000)).toBe(2)
    expect(await countDue(1000, 'vocab')).toBe(1)
    expect(await countDue(1000, 'noun')).toBe(1)
    expect(await countDue(50)).toBe(0)
  })

  it('countDueBetween counts a (from, to] window', async () => {
    await db.skills.bulkAdd([
      makeSkill({ skillId: 's1', wordId: 'w1', due: 1000 }),
      makeSkill({ skillId: 's2', wordId: 'w1', due: 2000 }),
      makeSkill({ skillId: 's3', wordId: 'w1', due: 3000 }),
    ])
    expect(await countDueBetween(1000, 2000)).toBe(1) // excludes 1000, includes 2000
    expect(await countDueBetween(999, 3000)).toBe(3)
  })
})

describe('getDueSkills — perf (acceptance point 2)', () => {
  it('queries 5000 synthetic skills via the index in under 20ms', async () => {
    const now = 1_000_000
    const records: SkillRecord[] = []
    for (let i = 0; i < 5000; i++) {
      const kinds = ['vocab', 'noun', 'verb', 'adj', 'adv'] as const
      records.push(
        makeSkill({
          skillId: `word${i}|NOUN::slot${i}`,
          wordId: `word${i}|NOUN`,
          kind: kinds[i % kinds.length],
          // Half the corpus is due (due <= now), half is not.
          due: i % 2 === 0 ? now - i : now + i + 1,
        }),
      )
    }
    await db.skills.bulkAdd(records)

    const t0 = performance.now()
    const due = await getDueSkills(now, 50)
    const elapsed = performance.now() - t0

    expect(due.length).toBe(50)
    expect(due.every((s) => s.due <= now)).toBe(true)
    console.log(`getDueSkills over 5000 rows: ${elapsed.toFixed(3)}ms`)
    expect(elapsed).toBeLessThan(20)
  })

  it('getDueSkills scoped by kind also uses the [kind+due] index and stays fast', async () => {
    const now = 1_000_000
    const records: SkillRecord[] = []
    for (let i = 0; i < 5000; i++) {
      const kinds = ['vocab', 'noun', 'verb', 'adj', 'adv'] as const
      records.push(
        makeSkill({
          skillId: `word${i}|NOUN::slot${i}`,
          wordId: `word${i}|NOUN`,
          kind: kinds[i % kinds.length],
          due: i % 2 === 0 ? now - i : now + i + 1,
        }),
      )
    }
    await db.skills.bulkAdd(records)

    const t0 = performance.now()
    const due = await getDueSkills(now, 50, 'noun')
    const elapsed = performance.now() - t0

    expect(due.every((s) => s.kind === 'noun' && s.due <= now)).toBe(true)
    console.log(`getDueSkills([kind+due], 5000 rows): ${elapsed.toFixed(3)}ms`)
    expect(elapsed).toBeLessThan(20)
  })
})

describe('hasAnySkill', () => {
  it('is false on an empty table', async () => {
    expect(await hasAnySkill()).toBe(false)
  })

  it('is true once at least one skill exists', async () => {
    await upsertSkill(makeSkill({ skillId: 's1', wordId: 'w1' }))
    expect(await hasAnySkill()).toBe(true)
  })
})
