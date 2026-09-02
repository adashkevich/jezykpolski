/**
 * `StoragePersistRequest` tests (`spec/tasks/25-offline-update.md` §6: "запрашивать после
 * того, как пользователь реально начал учиться").
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { StoragePersistRequest } from './StoragePersistRequest.tsx'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'

afterEach(async () => {
  cleanup()
  await deleteDatabase()
  vi.unstubAllGlobals()
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

describe('StoragePersistRequest', () => {
  it('does not call navigator.storage.persist() on an empty app', async () => {
    await openDatabase()
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist } })

    render(<StoragePersistRequest />)
    await new Promise((r) => setTimeout(r, 0))

    expect(persist).not.toHaveBeenCalled()
  })

  it('calls navigator.storage.persist() once a skill has been materialized', async () => {
    await openDatabase()
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist } })

    render(<StoragePersistRequest />)
    await upsertSkill(skill({ skillId: 's1', wordId: 'w1' }))

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })
})
