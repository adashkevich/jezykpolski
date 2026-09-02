/**
 * `useMorphologyProgress` tests (`spec/tasks/23-stats.md`).
 *
 * Every word uses `paradigmShard: -1` (no paradigm) so the denominator computation inside
 * `stats.repository.ts#getMorphologyProgress` resolves without a network/fetch mock — same
 * trick as `words-progress.repository.test.ts` — this file only needs to verify the hook's
 * own wiring (gating + liveness), not the percentage math (`stats.repository.test.ts`'s job).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useMorphologyProgress } from './useMorphologyProgress.ts'
import { __resetMorphologyDenominatorsForTest } from '@/db/repositories/stats.repository.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { SkillRecord } from '@/types/progress.ts'

function skill(overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId'>): SkillRecord {
  return {
    kind: 'noun',
    dimension: 'noun:sg:genitive',
    state: 'review',
    stability: 30,
    difficulty: 3,
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

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  __resetMorphologyDenominatorsForTest()
  await deleteDatabase()
})

describe('useMorphologyProgress', () => {
  it('reports both blocks hidden on a fresh install', async () => {
    initIndexStore([])
    await openDatabase()

    const { result } = renderHook(() => useMorphologyProgress())
    await waitFor(() =>
      expect(result.current).toEqual({
        hasNounData: false,
        hasVerbData: false,
        caseProgress: new Map(),
        tenseProgress: new Map(),
      }),
    )
  })

  it('is live: the noun block appears after the first noun skill is materialized', async () => {
    initIndexStore([
      { lemma: 'kot', pos: 'NOUN', rank: 1, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard: -1 },
    ])
    await openDatabase()

    const { result } = renderHook(() => useMorphologyProgress())
    await waitFor(() => expect(result.current?.hasNounData).toBe(false))

    await upsertSkill(skill({ skillId: 'kot|NOUN::noun:sg:genitive', wordId: 'kot|NOUN' }))

    await waitFor(() => expect(result.current?.hasNounData).toBe(true))
    expect(result.current?.hasVerbData).toBe(false)
  })
})
