/**
 * `words-progress.repository.ts` tests (`spec/tasks/05-persistence.md` §4, acceptance
 * point 5: "`recomputeAll` восстанавливает `wordProgress` из `skills` побитово так же, как
 * инкрементальный пересчёт").
 *
 * Uses words with `paradigmShard: -1` (no paradigm — architecture.md/task 02 §6, e.g.
 * pronouns) so `content/paradigms.ts#getParadigm` returns `null` synchronously without ever
 * calling `content/loader.ts#loadParadigmShard` — no `fetch` mock needed, while still
 * exercising the real `enumerateSkills` + `aggregateWord` pipeline these functions depend on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import {
  computeWordProgress,
  getAllWordProgress,
  getWordProgress,
  getWordProgressSummary,
  recomputeAll,
  recomputeWordProgress,
} from './words-progress.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord, WordProgressRecord } from '@/types/progress.ts'

function entry(lemma: string, rank: number): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank,
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: -1, // no paradigm — vocab-only skills, no network fetch involved
  }
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
    state: stability > 0 ? 'review' : 'new',
    stability,
    difficulty: 3,
    due: 1000,
    reps: stability > 0 ? 2 : 0,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 500,
    updatedAt: 500,
  }
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  await db.open()
  // Only fake `Date` (not timers/microtasks) — fake-indexeddb relies on real `setTimeout`
  // internally for its transaction scheduling, and faking that too hangs every operation.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
})

afterEach(async () => {
  vi.useRealTimers()
  await db.delete()
})

describe('computeWordProgress / recomputeWordProgress', () => {
  it('returns undefined for a word with zero skills, and getWordProgress agrees', async () => {
    initIndexStore([entry('nic', 1)])
    expect(await computeWordProgress('nic|NOUN', [])).toBeUndefined()
    await recomputeWordProgress('nic|NOUN')
    expect(await getWordProgress('nic|NOUN')).toBeUndefined()
  })

  it("computes status/maturity from the word's skills against the content-derived slot count", async () => {
    initIndexStore([entry('kobieta', 1)])
    await db.skills.bulkAdd([
      vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 60), // maturity 1.0 (TARGET_STABILITY_DAYS=60)
      vocabSkill('kobieta|NOUN', 'vocab:ru-pl', 0), // maturity 0
    ])
    await recomputeWordProgress('kobieta|NOUN')

    const progress = await getWordProgress('kobieta|NOUN')
    expect(progress?.vocabMaturity).toBeCloseTo(0.5) // average of 1.0 and 0
    expect(progress?.morphMaturity).toBe(0) // no paradigm -> undefined -> stored as 0
    expect(progress?.status).toBe('known') // vocabMaturity 0.5 >= KNOWN_THRESHOLD(0.35), < MASTERED_THRESHOLD(0.9)
  })
})

describe('recomputeAll matches incremental recomputeWordProgress bit-for-bit', () => {
  const words = ['kobieta', 'rower', 'pies', 'dom', 'kot']

  beforeEach(async () => {
    initIndexStore(words.map((w, i) => entry(w, i + 1)))
    const skills: SkillRecord[] = []
    for (const [i, w] of words.entries()) {
      const wordId = `${w}|NOUN`
      // Vary stability per word so maturity/status differ across the set.
      skills.push(vocabSkill(wordId, 'vocab:pl-ru', i * 15))
      if (i % 2 === 0) skills.push(vocabSkill(wordId, 'vocab:ru-pl', i * 10))
    }
    // One extra word with no skills at all — must produce no row either way.
    await db.skills.bulkAdd(skills)
  })

  it('produces an identical wordProgress table to calling recomputeWordProgress on every word', async () => {
    // 1. Incremental: call recomputeWordProgress for each word individually.
    for (const w of words) {
      await recomputeWordProgress(`${w}|NOUN`)
    }
    const incremental = await getAllWordProgress()

    // 2. Wipe wordProgress (simulating a stale/corrupted cache) and rebuild via recomputeAll.
    await db.wordProgress.clear()
    await recomputeAll()
    const fromRecomputeAll = await getAllWordProgress()

    expect(fromRecomputeAll.size).toBe(incremental.size)
    expect(fromRecomputeAll.size).toBe(words.length)
    for (const wordId of incremental.keys()) {
      expect(fromRecomputeAll.get(wordId)).toEqual(incremental.get(wordId))
    }
  })

  it('recomputeAll clears stale rows for words whose last skill was since deleted', async () => {
    await recomputeAll()
    expect(await getWordProgress('kobieta|NOUN')).toBeDefined()

    await db.skills.where('wordId').equals('kobieta|NOUN').delete()
    await recomputeAll()

    expect(await getWordProgress('kobieta|NOUN')).toBeUndefined()
  })
})

// `spec/tasks/15-home-screen.md` §3/§4: the home screen's "изучается / выучено" counters
// (overall and per part of speech) must come from `wordProgress`'s `status` index only,
// never a full-table `.toArray()`. This suite writes `wordProgress` rows directly (bypassing
// `computeWordProgress`'s content/paradigm pipeline entirely — status-and-POS bucketing
// doesn't need any of that) to isolate `getWordProgressSummary`'s own aggregation logic.
describe('getWordProgressSummary', () => {
  function row(wordId: string, status: WordProgressRecord['status']): WordProgressRecord {
    return { wordId, status, vocabMaturity: 0, morphMaturity: 0, updatedAt: 0 }
  }

  it('returns all-zero counts against an empty table', async () => {
    expect(await getWordProgressSummary()).toEqual({
      learningTotal: 0,
      learnedTotal: 0,
      learnedByPos: {},
    })
  })

  it('buckets "learning" (overall) and "known"+"mastered" (overall and per POS) from wordId, ignoring "new"', async () => {
    await db.wordProgress.bulkPut([
      row('kot|NOUN', 'learning'),
      row('pies|NOUN', 'learning'),
      row('być|VERB', 'learning'),
      row('kobieta|NOUN', 'known'),
      row('rower|NOUN', 'known'),
      row('dom|NOUN', 'known'),
      row('dobry|ADJ', 'known'),
      row('człowiek|NOUN', 'mastered'),
      row('mieć|VERB', 'mastered'),
      row('robić|VERB', 'mastered'),
      // A 'new'-status row is not something the real app ever writes (architecture.md §5.2:
      // "no record" already means new), but the aggregation must not count it either way if
      // one somehow existed.
      row('nowy|ADJ', 'new'),
    ])

    expect(await getWordProgressSummary()).toEqual({
      learningTotal: 3,
      learnedTotal: 7, // 4 known + 3 mastered
      learnedByPos: { NOUN: 4, VERB: 2, ADJ: 1 },
    })
  })

  it('reads via the "status" index (primaryKeys), not a full-table scan', async () => {
    await db.wordProgress.bulkPut([row('kot|NOUN', 'known'), row('pies|NOUN', 'learning')])
    const toArraySpy = vi.spyOn(db.wordProgress, 'toArray')

    await getWordProgressSummary()

    expect(toArraySpy).not.toHaveBeenCalled()
  })
})
