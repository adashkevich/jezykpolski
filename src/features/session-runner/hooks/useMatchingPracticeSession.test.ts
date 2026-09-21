/**
 * `useMatchingPracticeSession` tests (`spec/tasks/27-context-and-error-analysis.md` §4,
 * FR-55). Same DB-integration convention as `TableExercise.test.tsx`/`useWordProgress.test.ts`
 * — a real (fake-indexeddb) database, `paradigmShard: -1` throughout (vocab-only grading
 * needs no paradigm fetch) so only the senses-shard fetch needs stubbing.
 *
 * Task 44 (`spec/tasks/44-matching-credit-all-but-mistaken.md`, FR-55/FR-152) — replaced
 * task 36's "last 2 pairings are never graded" rule: `gradePair(wordId, { graded })` grades
 * every pairing whose `graded` is true (the flag comes from `MatchingExercise.tsx`, which
 * marks a word `graded: false` once its PL or RU tile took part in a wrong pairing — see
 * `lexical-batch.ts#shouldGradeMatch`) and writes nothing for `graded: false`. Position in the
 * batch no longer matters, so a 5-word batch grades all five pairs and even a 2-word one grades
 * both; dedicated tests cover both directions of the flag.
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

/** A 5-word batch (`MATCHING_PAIR_COUNT`) — the size the screen actually uses. */
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

    await act(async () => {
      await result.current.gradePair(KOBIETA_ID, { graded: true })
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

    // Only 2 of 5 pairings matched. Each graded pairing counts as 2 (both vocab skills),
    // so 2 pairings -> totalCount 4.
    await act(async () => {
      await result.current.gradePair(KOBIETA_ID, { graded: true })
      await result.current.gradePair(DOM_ID, { graded: true })
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

  // Task 44 (replaces task 36's tail rule) — no mistakes, so `MatchingExercise` reports every
  // pairing as graded: all 5 are written, the last two included. 5 pairings × 2 skills each
  // = 10 log entries (FR-152, updated by tasks 39 and 44).
  it('grades every pairing of a batch, including the last two', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession(FIVE_WORD_BATCH))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    await act(async () => {
      for (const wordId of FIVE_WORD_BATCH) {
        await result.current.gradePair(wordId, { graded: true })
      }
    })

    expect(await getLogsForSession(sessionId)).toHaveLength(10)
    for (const wordId of FIVE_WORD_BATCH) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    }

    await act(async () => {
      await result.current.finish()
    })
    const session = await getSession(sessionId)
    expect(session?.totalCount).toBe(10)
    expect(session?.correctCount).toBe(10)
  })

  // A_pl -> B_ru was a mistake, so A and B arrive as `graded: false` even though they are later
  // matched correctly; C, D, E (untouched) arrive as `graded: true`. Only those three are written.
  it('writes nothing for a pairing reported as not graded (a tainted word), grades the rest', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession(FIVE_WORD_BATCH))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    await act(async () => {
      await result.current.gradePair(KOBIETA_ID, { graded: false })
      await result.current.gradePair(DOM_ID, { graded: false })
      await result.current.gradePair(KOT_ID, { graded: true })
      await result.current.gradePair(PIES_ID, { graded: true })
      await result.current.gradePair(OKNO_ID, { graded: true })
    })

    expect(await getLogsForSession(sessionId)).toHaveLength(6)
    for (const wordId of [KOBIETA_ID, DOM_ID]) {
      expect(await getSkill(`${wordId}::vocab:pl-ru`)).toBeUndefined()
      expect(await getSkill(`${wordId}::vocab:ru-pl-choice`)).toBeUndefined()
    }
    for (const wordId of [KOT_ID, PIES_ID, OKNO_ID]) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    }

    await act(async () => {
      await result.current.finish()
    })
    const session = await getSession(sessionId)
    expect(session?.totalCount).toBe(6)
    expect(session?.correctCount).toBe(6)
  })

  it('deletes the session when every pairing was reported as not graded', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession([KOBIETA_ID, DOM_ID]))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')
    const sessionId = result.current.status.sessionId

    await act(async () => {
      await result.current.gradePair(KOBIETA_ID, { graded: false })
      await result.current.gradePair(DOM_ID, { graded: false })
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

  it('grades a 2-word batch too — batch size no longer excludes anything', async () => {
    const { result } = renderHook(() => useMatchingPracticeSession([KOBIETA_ID, DOM_ID]))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))
    if (result.current.status.phase !== 'ready') throw new Error('unreachable')

    await act(async () => {
      await result.current.gradePair(KOBIETA_ID, { graded: true })
      await result.current.gradePair(DOM_ID, { graded: true })
    })

    expect(await getLogsForSession(result.current.status.sessionId)).toHaveLength(4)
  })
})
