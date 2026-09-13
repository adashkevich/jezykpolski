/**
 * `gradeMatchingPair` (task 40 §4) — extracted from `useMatchingPracticeSession.ts`'s own
 * grading loop (task 39). Same DB-integration convention as `answer-pipeline.test.ts` — a
 * real (fake-indexeddb) database via `lifecycle.repository.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { MatchingPairSource } from '@/learning/exercises/exercise.types.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { gradeMatchingPair } from './grade-matching-pair.ts'

const WORD_ID = 'kobieta|NOUN'
const PAIR: MatchingPairSource = { wordId: WORD_ID, pl: 'kobieta', ru: 'женщина' }

function entry(overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma'>): WordIndexEntry {
  return {
    pos: 'NOUN',
    rank: 1,
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    // -1 = "no paradigm" (task 02 §6) — sidesteps any network fetch, same trick
    // `answer-pipeline.test.ts` uses for vocab-only tests.
    paradigmShard: -1,
    ...overrides,
  }
}

beforeEach(async () => {
  await openDatabase()
  __resetIndexStoreForTest()
  initIndexStore([entry({ lemma: 'kobieta', primaryRu: 'женщина' })])
})

afterEach(async () => {
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('gradeMatchingPair', () => {
  it('grades both vocab:pl-ru and vocab:ru-pl-choice, both correct, both counted', async () => {
    const result = await gradeMatchingPair({
      sessionId: 1,
      mode: 'practice',
      pair: PAIR,
      elapsedMs: 500,
      now: 1_000_000,
    })

    expect(result.total).toBe(2)
    expect(result.correct).toBe(2)
    expect(result.newSkillCount).toBe(2)
    expect(result.skills.map((s) => s.skillId)).toEqual([
      `${WORD_ID}::vocab:pl-ru`,
      `${WORD_ID}::vocab:ru-pl-choice`,
    ])
    expect(result.skills.every((s) => s.isNewSkill)).toBe(true)

    const plRu = await getSkill(`${WORD_ID}::vocab:pl-ru`)
    const ruPlChoice = await getSkill(`${WORD_ID}::vocab:ru-pl-choice`)
    expect(plRu?.correct).toBe(1)
    expect(plRu?.incorrect).toBe(0)
    expect(ruPlChoice?.correct).toBe(1)
    expect(ruPlChoice?.incorrect).toBe(0)
    expect(await getSkill(`${WORD_ID}::vocab:ru-pl-input`)).toBeUndefined()

    const logs = await getLogsForSession(1)
    expect(logs).toHaveLength(2)
  })

  it('never double-counts vocab:pl-ru via the task-40 cascade (skipCascade)', async () => {
    await gradeMatchingPair({
      sessionId: 1,
      mode: 'practice',
      pair: PAIR,
      elapsedMs: 500,
      now: 1_000_000,
    })
    // If the cascade had fired for the vocab:ru-pl-choice call, vocab:pl-ru would show
    // correct: 2 instead of 1 (once from its own explicit call, once from the cascade).
    expect((await getSkill(`${WORD_ID}::vocab:pl-ru`))!.correct).toBe(1)
  })

  it('isNewSkill is false on a second grading of an already-graded pair', async () => {
    await gradeMatchingPair({ sessionId: 1, mode: 'practice', pair: PAIR, elapsedMs: 500, now: 1_000_000 })
    const second = await gradeMatchingPair({
      sessionId: 2,
      mode: 'practice',
      pair: PAIR,
      elapsedMs: 500,
      now: 2_000_000,
    })
    expect(second.newSkillCount).toBe(0)
  })
})
