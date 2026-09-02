/**
 * `useHasAnySkill` tests (`spec/tasks/25-offline-update.md` §6).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useHasAnySkill } from './useHasAnySkill.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'

afterEach(async () => {
  cleanup()
  await deleteDatabase()
})

function skill(overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId'>): SkillRecord {
  return {
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
    ...overrides,
  }
}

describe('useHasAnySkill', () => {
  it('is false on an empty database', async () => {
    await openDatabase()
    const { result } = renderHook(() => useHasAnySkill())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('flips to true once a skill is written', async () => {
    await openDatabase()
    const { result } = renderHook(() => useHasAnySkill())
    await waitFor(() => expect(result.current).toBe(false))

    await upsertSkill(skill({ skillId: 's1', wordId: 'w1' }))

    await waitFor(() => expect(result.current).toBe(true))
  })
})
