/**
 * `useMatchingPracticeSession` tests (`spec/tasks/27-context-and-error-analysis.md` §4,
 * FR-55). Same DB-integration convention as `TableExercise.test.tsx`/`useWordProgress.test.ts`
 * — a real (fake-indexeddb) database, `paradigmShard: -1` throughout (vocab-only grading
 * needs no paradigm fetch) so only the senses-shard fetch needs stubbing.
 *
 * Task 36 (`spec/tasks/36-practice-screen-restructure.md` §4, FR-152) — the last
 * `MATCHING_UNGRADED_TAIL` (2) pairings of a batch are never graded (see
 * `lexical-batch.ts#shouldGradeMatch`'s own header for why). Every test below that exercises
 * *grading* now uses a 5-word batch (`MATCHING_PAIR_COUNT`) rather than 2, so the pairs it
 * grades fall before that tail; a dedicated test covers the tail exclusion itself.
 *
 * Task 39 (`spec/tasks/39-practice-current-level.md`, direct user decision) — a graded pairing
 * now grades BOTH `vocab:pl-ru` and `vocab:ru-pl-choice`, so a graded pairing writes 2
 * `reviewLogs` entries, not 1; every count below is doubled from its task-36-era value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { useMatchingPracticeSession } from './useMatchingPracticeSession.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { getSession } from '@/db/repositories/sessions.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'

function entry(lemma: string, primaryRu: string): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank: 1,
    level: 'A1',
    primaryRu,
    sensesShard: 0,
    paradigmShard: -1,
  }
}

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const DOM_ID = encodeWordId('dom', 'NOUN')
const KOT_ID = encodeWordId('kot', 'NOUN')
const PIES_ID = encodeWordId('pies', 'NOUN')
const OKNO_ID = encodeWordId('okno', 'NOUN')

/** A 5-word batch (`MATCHING_PAIR_COUNT`) — the first 3 pairings (`shouldGradeMatch`'s
 *  `totalPairs - MATCHING_UNGRADED_TAIL` = 3) are graded, the last 2 never are. */
const FIVE_WORD_BATCH = [KOBIETA_ID, DOM_ID, KOT_ID, PIES_ID, OKNO_ID]

function stubEmptySensesFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
  )
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  initIndexStore([
    entry('kobieta', 'женщина'),
    entry('dom', 'дом'),
    entry('kot', 'кот'),
    entry('pies', 'собака'),
    entry('okno', 'окно'),
  ])
  stubEmptySensesFetch()
  await openDatabase()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await deleteDatabase()
})

describe('useMatchingPracticeSession', () => {
  it('resolves pairs from the content index once preloaded', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession([KOBIETA_ID, DOM_ID]))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    expect(result.current.status.pairs).toEqual([
      { wordId: KOBIETA_ID, pl: 'kobieta', ru: 'женщина' },
      { wordId: DOM_ID, pl: 'dom', ru: 'дом' },
    ])
  })

  // Task 39 — a graded pairing materializes and grades BOTH vocab skills, not just
  // vocab:pl-ru, and never touches vocab:ru-pl-input (matching never asks for typed input).
  it('gradePair materializes both vocab:pl-ru and vocab:ru-pl-choice, correct in both directions', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession(FIVE_WORD_BATCH))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))

    // First pairing of a 5-pair batch (index 0) — well before the ungraded tail.
    await act(async () => {
      await result.current.gradePair(KOBIETA_ID)
    })

    const plRu = await getSkill(`${KOBIETA_ID}::vocab:pl-ru`)
    expect(plRu).toBeDefined()
    expect(plRu!.correct).toBe(1)
    expect(plRu!.incorrect).toBe(0)

    const ruPlChoice = await getSkill(`${KOBIETA_ID}::vocab:ru-pl-choice`)
    expect(ruPlChoice).toBeDefined()
    expect(ruPlChoice!.correct).toBe(1)
    expect(ruPlChoice!.incorrect).toBe(0)

    expect(await getSkill(`${KOBIETA_ID}::vocab:ru-pl-input`)).toBeUndefined()

    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const logs = await getLogsForSession(result.current.status.sessionId)
    expect(logs).toHaveLength(2)
    expect(logs.every((log) => log.correct)).toBe(true)
    expect(logs.map((log) => log.answerGiven).sort()).toEqual(['kobieta', 'женщина'].sort())
  })

  it('finish() completes the session with a summary once at least one pair was graded', async () => {
    const { result, unmount } = renderHook(() => useMatchingPracticeSession(FIVE_WORD_BATCH))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    // Only the first 2 of 5 pairings — both before the ungraded tail (threshold 3). Each
    // graded pairing counts as 2 (both vocab skills), so 2 pairings -> totalCount 4.
    await act(async () => {
      await result.current.gradePair(KOBIETA_ID)
      await result.current.gradePair(DOM_ID)
    })
    await act(async () => {
      await result.current.finish()
    })

    const session = await getSession(sessionId)
    expect(session?.endedAt).toBeDefined()
    expect(session?.totalCount).toBe(4)
    expect(session?.correctCount).toBe(4)

    unmount() // the unmount-time finish() cleanup must be a no-op (already finished)
  })

  it('finish() deletes the session if nothing was ever graded (opened then abandoned)', async () => {
    const { result, unmount } = renderHook(() => useMatchingPracticeSession([KOBIETA_ID, DOM_ID]))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    await act(async () => {
      await result.current.finish()
    })
    expect(await getSession(sessionId)).toBeUndefined()
    unmount()
  })

  // Task 36 (`spec/tasks/36-practice-screen-restructure.md` §4, FR-152), counts doubled by
  // task 39 (2 skills per graded pairing instead of 1).
  it('never grades the last MATCHING_UNGRADED_TAIL pairings of a batch', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession(FIVE_WORD_BATCH))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    // All 5 pairings matched correctly, in order — only the first 3 (indices 0,1,2) should
    // ever reach `submitAnswer`/`reviewLogs`; the last 2 (PIES, OKNO) never do. 3 graded
    // pairings × 2 skills each = 6 log entries (FR-152, updated by task 39).
    await act(async () => {
      await result.current.gradePair(KOBIETA_ID)
      await result.current.gradePair(DOM_ID)
      await result.current.gradePair(KOT_ID)
      await result.current.gradePair(PIES_ID)
      await result.current.gradePair(OKNO_ID)
    })

    const logs = await getLogsForSession(sessionId)
    expect(logs).toHaveLength(6)

    expect(await getSkill(`${PIES_ID}::vocab:pl-ru`)).toBeUndefined()
    expect(await getSkill(`${PIES_ID}::vocab:ru-pl-choice`)).toBeUndefined()
    expect(await getSkill(`${OKNO_ID}::vocab:pl-ru`)).toBeUndefined()
    expect(await getSkill(`${OKNO_ID}::vocab:ru-pl-choice`)).toBeUndefined()

    await act(async () => {
      await result.current.finish()
    })
    const session = await getSession(sessionId)
    expect(session?.totalCount).toBe(6)
    expect(session?.correctCount).toBe(6)
  })

  it('grades nothing at all in a batch no larger than MATCHING_UNGRADED_TAIL', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession([KOBIETA_ID, DOM_ID]))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    await act(async () => {
      await result.current.gradePair(KOBIETA_ID)
      await result.current.gradePair(DOM_ID)
    })

    expect(await getLogsForSession(sessionId)).toHaveLength(0)
    expect(await getSkill(`${KOBIETA_ID}::vocab:pl-ru`)).toBeUndefined()
    expect(await getSkill(`${KOBIETA_ID}::vocab:ru-pl-choice`)).toBeUndefined()

    await act(async () => {
      await result.current.finish()
    })
    // Nothing was ever graded -> the same "abandoned, delete the session" path as finishing
    // with zero `gradePair` calls at all.
    expect(await getSession(sessionId)).toBeUndefined()
  })
})
