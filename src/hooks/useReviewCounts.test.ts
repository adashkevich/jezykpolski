/**
 * `useReviewCounts` tests (`spec/tasks/23-stats.md`).
 *
 * Same fixture-through-repository discipline as `useDueCount.test.ts` (this file lives
 * outside `src/db/**`, held to the `no-restricted-imports` rule like any other consumer).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useReviewCounts } from './useReviewCounts.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { startOfTomorrow } from '@/lib/dates.ts'
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

describe('useReviewCounts', () => {
  it('reports today/tomorrow/in7Days counts for the captured "now"', async () => {
    await openDatabase()
    const now = 10_000
    await upsertSkill(skill({ skillId: 's1', wordId: 'w1', due: now - 100 }))
    await upsertSkill(skill({ skillId: 's2', wordId: 'w1', due: startOfTomorrow(now) + 1 }))

    const { result } = renderHook(() => useReviewCounts(now))
    await waitFor(() => expect(result.current).toEqual({ today: 1, tomorrow: 1, in7Days: 1 }))
  })

  it('is live: updates after a new due skill is written', async () => {
    await openDatabase()
    const now = 10_000
    const { result } = renderHook(() => useReviewCounts(now))
    await waitFor(() => expect(result.current).toEqual({ today: 0, tomorrow: 0, in7Days: 0 }))

    await upsertSkill(skill({ skillId: 's1', wordId: 'w1', due: now - 1 }))

    await waitFor(() => expect(result.current?.today).toBe(1))
  })
})
