/**
 * `useDueCount` tests (`spec/tasks/05-persistence.md` §8).
 *
 * Sets up fixture data through `skills.repository.ts`/`lifecycle.repository.ts`, not by
 * importing `db/database.ts` directly — this test file lives outside `src/db/**`, so (like
 * any other consumer) it's held to the same `no-restricted-imports` rule (acceptance point 7).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useDueCount } from './useDueCount.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'

afterEach(async () => {
  cleanup()
  await deleteDatabase()
})

function skill(
  overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId' | 'due'>,
): SkillRecord {
  return {
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 5,
    difficulty: 3,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('useDueCount', () => {
  it('reports the number of skills due at the captured "now"', async () => {
    await openDatabase()
    const now = 10_000
    await upsertSkill(skill({ skillId: 's1', wordId: 'w1', due: now - 100 }))
    await upsertSkill(skill({ skillId: 's2', wordId: 'w1', due: now + 100 }))

    const { result } = renderHook(() => useDueCount(undefined, now))
    await waitFor(() => expect(result.current).toBe(1))
  })

  it('is live: updates after a new due skill is written to the db', async () => {
    await openDatabase()
    const now = 10_000
    const { result } = renderHook(() => useDueCount(undefined, now))
    await waitFor(() => expect(result.current).toBe(0))

    await upsertSkill(skill({ skillId: 's1', wordId: 'w1', due: now - 1 }))

    await waitFor(() => expect(result.current).toBe(1))
  })

  it('scopes by kind when given', async () => {
    await openDatabase()
    const now = 10_000
    await upsertSkill(skill({ skillId: 's1', wordId: 'w1', due: now - 1, kind: 'vocab' }))
    await upsertSkill(skill({ skillId: 's2', wordId: 'w1', due: now - 1, kind: 'noun' }))

    const { result } = renderHook(() => useDueCount('noun', now))
    await waitFor(() => expect(result.current).toBe(1))
  })
})
