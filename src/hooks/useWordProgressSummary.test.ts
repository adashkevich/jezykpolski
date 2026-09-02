/**
 * `useWordProgressSummary` tests (`spec/tasks/15-home-screen.md` §3/§4).
 *
 * Fixture data goes through the real `upsertSkill` + `recomputeWordProgress` repository
 * functions (same trick as `useWordProgress.test.ts`), not a direct `db.wordProgress` write
 * — this file lives outside `src/db/**`, so it's held to the same `no-restricted-imports`
 * rule as any other consumer (acceptance point 7). Every word uses `paradigmShard: -1` (no
 * paradigm) so `recomputeWordProgress`'s content lookup never needs a network/fetch mock,
 * and status is driven purely by the two `vocab:*` skills' FSRS `stability`
 * (`aggregate.ts#TARGET_STABILITY_DAYS = 60`, `KNOWN_THRESHOLD = 0.35`,
 * `MASTERED_THRESHOLD = 0.9`) — both dimensions get the same stability so
 * `vocabMaturity = stability / 60` exactly, with no averaging-in of an unrecorded slot.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useWordProgressSummary } from './useWordProgressSummary.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

function entry(lemma: string, pos: PosValue, rank: number): WordIndexEntry {
  return { lemma, pos, rank, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard: -1 }
}

function vocabSkill(
  wordId: string,
  dim: 'vocab:pl-ru' | 'vocab:ru-pl',
  stability: number,
): SkillRecord {
  return {
    skillId: `${wordId}::${dim}`,
    wordId,
    kind: 'vocab',
    dimension: dim,
    state: 'review',
    stability,
    difficulty: 3,
    due: 1000,
    reps: 2,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** Writes both vocab skills at the same `stability` (so `vocabMaturity = stability / 60`
 *  exactly) and recomputes `wordProgress` for `wordId`. */
async function learnWord(wordId: string, stability: number): Promise<void> {
  await upsertSkill(vocabSkill(wordId, 'vocab:pl-ru', stability))
  await upsertSkill(vocabSkill(wordId, 'vocab:ru-pl', stability))
  await recomputeWordProgress(wordId)
}

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  await deleteDatabase()
})

describe('useWordProgressSummary', () => {
  it('is all-zero with an empty wordProgress table', async () => {
    initIndexStore([])
    await openDatabase()

    const { result } = renderHook(() => useWordProgressSummary())
    await waitFor(() =>
      expect(result.current).toEqual({
        learningTotal: 0,
        learnedTotal: 0,
        learnedByPos: {},
        learnedByLevel: {},
      }),
    )
  })

  it('aggregates "learning" and "known"/"mastered" overall and per part of speech', async () => {
    initIndexStore([
      entry('kot', 'NOUN', 1),
      entry('pies', 'NOUN', 2),
      entry('kobieta', 'NOUN', 3),
      entry('być', 'VERB', 4),
      entry('dobry', 'ADJ', 5),
    ])
    await openDatabase()

    await learnWord('kot|NOUN', 10) // maturity 0.167 -> learning
    await learnWord('pies|NOUN', 10) // learning
    await learnWord('kobieta|NOUN', 25) // maturity 0.417 -> known
    await learnWord('być|VERB', 25) // known
    await learnWord('dobry|ADJ', 60) // maturity 1.0 -> mastered (no paradigm, so vocab-only)

    const { result } = renderHook(() => useWordProgressSummary())
    await waitFor(() =>
      expect(result.current).toEqual({
        learningTotal: 2,
        learnedTotal: 3,
        learnedByPos: { NOUN: 1, VERB: 1, ADJ: 1 },
        learnedByLevel: { A1: 3 },
      }),
    )
  })

  it('is live: updates after a word crosses into "known"', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1)])
    await openDatabase()
    await learnWord('kobieta|NOUN', 10) // learning

    const { result } = renderHook(() => useWordProgressSummary())
    await waitFor(() => expect(result.current?.learningTotal).toBe(1))

    await learnWord('kobieta|NOUN', 25) // known

    await waitFor(() =>
      expect(result.current).toEqual({
        learningTotal: 0,
        learnedTotal: 1,
        learnedByPos: { NOUN: 1 },
        learnedByLevel: { A1: 1 },
      }),
    )
  })
})
