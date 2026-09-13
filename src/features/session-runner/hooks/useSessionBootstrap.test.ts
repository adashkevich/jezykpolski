/**
 * `useSessionBootstrap.ts` — task 40 §4's in-session "Сопоставление" block insertion
 * (`spec/tasks/40-vocab-streak-progression.md`). Same DB-integration convention as
 * `useMatchingPracticeSession.test.ts` — a real (fake-indexeddb) database, `paradigmShard: -1`
 * throughout (vocab-only fixtures need no paradigm fetch), a stubbed empty senses fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSessionBootstrap } from './useSessionBootstrap.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { ensureSkill, getSkill, upsertSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { DEFAULT_EXERCISE_TYPES_SETTING_KEY } from '@/learning/exercises/default-exercise-type.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import { useSessionStore } from '@/stores/session.store.ts'
import type { WordIndexEntry } from '@/types/content.ts'

const MATCHING_CANDIDATE_LEMMAS = ['kobieta', 'dom', 'kot', 'pies', 'okno'] as const
const FAR_FUTURE = Date.now() + 30 * 24 * 60 * 60 * 1000

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: -1,
    ...overrides,
  }
}

function stubEmptySensesFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
  )
}

/** Puts a word at status `'learning'` (a `SkillRecord` that hasn't graduated production —
 *  `aggregate.ts#deriveStatus`) with its `due` pushed far into the future, so it's eligible
 *  for `resolveSessionMatchingWordIds`'s `status: ['learning']` filter WITHOUT also being
 *  due right now (which would instead pull it into the ordinary due queue). */
async function markLearningNotDue(lemma: string): Promise<void> {
  const wordId = encodeWordId(lemma, 'NOUN')
  const skillId = encodeSkillId(wordId, 'vocab:pl-ru')
  await ensureSkill(skillId, wordId, 'vocab', 'vocab:pl-ru')
  const skill = await getSkill(skillId)
  await upsertSkill({ ...skill!, due: FAR_FUTURE })
  await recomputeWordProgress(wordId)
}

beforeEach(async () => {
  await openDatabase()
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  stubEmptySensesFetch()
  useSessionStore.getState().reset()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('useSessionBootstrap — in-session matching block (task 40 §4)', () => {
  it('inserts a matching-typed queue item when enough learning-status words exist outside the queue', async () => {
    const dueWordId = encodeWordId('robic', 'VERB')
    initIndexStore([
      entry({ lemma: 'robic', pos: 'VERB', level: 'A1', rank: 1 }),
      ...MATCHING_CANDIDATE_LEMMAS.map((lemma, i) => entry({ lemma, level: 'A1', rank: i + 2 })),
    ])
    // One genuinely due skill so the ordinary Learn queue is non-empty.
    await ensureSkill(encodeSkillId(dueWordId, 'vocab:pl-ru'), dueWordId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(dueWordId)
    for (const lemma of MATCHING_CANDIDATE_LEMMAS) await markLearningNotDue(lemma)

    const { result } = renderHook(() => useSessionBootstrap({ kind: 'global' }))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))

    const queue = useSessionStore.getState().queue
    const matchingItems = queue.filter((item) => item.exercise.type === 'matching')
    expect(matchingItems).toHaveLength(1)
    if (matchingItems[0]!.exercise.type === 'matching') {
      expect(matchingItems[0]!.exercise.pairs).toHaveLength(5) // MATCHING_PAIR_COUNT
      const matchingWordIds = matchingItems[0]!.exercise.pairs.map((p) => p.wordId)
      // None of the matching block's words is the same word already due in the ordinary queue.
      expect(matchingWordIds).not.toContain(dueWordId)
    }
  })

  it('omits the block entirely when fewer than MATCHING_PAIR_COUNT learning-status words exist outside the queue', async () => {
    const dueWordId = encodeWordId('robic', 'VERB')
    initIndexStore([
      entry({ lemma: 'robic', pos: 'VERB', level: 'A1', rank: 1 }),
      // Only 2 learning-status candidates — below MATCHING_PAIR_COUNT (5).
      ...MATCHING_CANDIDATE_LEMMAS.slice(0, 2).map((lemma, i) =>
        entry({ lemma, level: 'A1', rank: i + 2 }),
      ),
    ])
    await ensureSkill(encodeSkillId(dueWordId, 'vocab:pl-ru'), dueWordId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(dueWordId)
    for (const lemma of MATCHING_CANDIDATE_LEMMAS.slice(0, 2)) await markLearningNotDue(lemma)

    const { result } = renderHook(() => useSessionBootstrap({ kind: 'global' }))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))

    const queue = useSessionStore.getState().queue
    expect(queue.some((item) => item.exercise.type === 'matching')).toBe(false)
  })

  it('never inserts a matching block when "Тип задания по умолчанию" restricts to one category', async () => {
    await settingsRepo.set(DEFAULT_EXERCISE_TYPES_SETTING_KEY, { choice: true, input: false })
    const dueWordId = encodeWordId('robic', 'VERB')
    initIndexStore([
      entry({ lemma: 'robic', pos: 'VERB', level: 'A1', rank: 1 }),
      ...MATCHING_CANDIDATE_LEMMAS.map((lemma, i) => entry({ lemma, level: 'A1', rank: i + 2 })),
    ])
    await ensureSkill(encodeSkillId(dueWordId, 'vocab:pl-ru'), dueWordId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(dueWordId)
    for (const lemma of MATCHING_CANDIDATE_LEMMAS) await markLearningNotDue(lemma)

    const { result } = renderHook(() => useSessionBootstrap({ kind: 'global' }))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))

    const queue = useSessionStore.getState().queue
    expect(queue.some((item) => item.exercise.type === 'matching')).toBe(false)
  })

  it('never inserts a matching block for a mistake-review scope', async () => {
    const wordId = encodeWordId('robic', 'VERB')
    const skillId = encodeSkillId(wordId, 'vocab:pl-ru')
    initIndexStore([
      entry({ lemma: 'robic', pos: 'VERB', level: 'A1', rank: 1 }),
      ...MATCHING_CANDIDATE_LEMMAS.map((lemma, i) => entry({ lemma, level: 'A1', rank: i + 2 })),
    ])
    await ensureSkill(skillId, wordId, 'vocab', 'vocab:pl-ru')
    await recomputeWordProgress(wordId)
    for (const lemma of MATCHING_CANDIDATE_LEMMAS) await markLearningNotDue(lemma)

    const { result } = renderHook(() => useSessionBootstrap({ kind: 'mistake', skillIds: [skillId] }))
    await waitFor(() => expect(result.current.status.phase).toBe('ready'))

    const queue = useSessionStore.getState().queue
    expect(queue.some((item) => item.exercise.type === 'matching')).toBe(false)
  })
})
