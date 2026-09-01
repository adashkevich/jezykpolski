/**
 * `useWordProgress` / `useAllWordProgress` tests (`spec/tasks/05-persistence.md` §8).
 *
 * Fixture data is built through real repository functions (`upsertSkill` +
 * `recomputeWordProgress`), not by writing to `db.wordProgress` directly — this test file
 * lives outside `src/db/**`, so it's held to the same `no-restricted-imports` rule
 * (acceptance point 7) as any other consumer. Words use `paradigmShard: -1` (no paradigm)
 * so `recomputeWordProgress`'s content lookup never needs a network/fetch mock — see
 * `words-progress.repository.test.ts`'s header for the same trick.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAllWordProgress, useWordProgress } from './useWordProgress.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

function entry(lemma: string, rank: number): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank,
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: -1,
  }
}

function skill(wordId: string): SkillRecord {
  return {
    skillId: `${wordId}::vocab:pl-ru`,
    wordId,
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 30,
    difficulty: 3,
    due: 5000,
    reps: 2,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  await deleteDatabase()
})

describe('useWordProgress', () => {
  it('is undefined until the word has a wordProgress row, then reflects it', async () => {
    initIndexStore([entry('kobieta', 1)])
    await openDatabase()

    const { result } = renderHook(() => useWordProgress('kobieta|NOUN'))
    await waitFor(() => expect(result.current).toBeUndefined())

    await upsertSkill(skill('kobieta|NOUN'))
    await recomputeWordProgress('kobieta|NOUN')

    await waitFor(() => expect(result.current?.status).toBe('learning'))
  })
})

describe('useAllWordProgress', () => {
  it('returns a live map keyed by wordId', async () => {
    initIndexStore([entry('kobieta', 1), entry('rower', 2)])
    await openDatabase()
    await upsertSkill(skill('kobieta|NOUN'))
    await recomputeWordProgress('kobieta|NOUN')

    const { result } = renderHook(() => useAllWordProgress())
    await waitFor(() => expect(result.current?.size).toBe(1))
    expect(result.current?.has('kobieta|NOUN')).toBe(true)

    await upsertSkill(skill('rower|NOUN'))
    await recomputeWordProgress('rower|NOUN')

    await waitFor(() => expect(result.current?.size).toBe(2))
  })
})
