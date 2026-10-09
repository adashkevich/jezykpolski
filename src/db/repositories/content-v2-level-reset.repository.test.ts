/**
 * Task 49 (`spec/tasks/49-primary-sense-learning-and-level-reset.md` §1, acceptance) on a real
 * Dexie database (fake-indexeddb): the `content-v2-level-reset` startup step.
 *
 * The content index is a v2 one: `A1` holds the words that were A1 in v1 (already started by
 * the user) plus words that only became A1 in v2 (primary-sense level, not started) — exactly
 * the situation the step exists for. Words have no paradigm (`paradigmShard: -1`), so the three
 * vocab skills are all a word has and `recomputeAll` never fetches anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LevelValue } from '@/content/codec.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import {
  currentNewWordLevel,
  NEW_WORDS_START_LEVEL_SETTING_KEY,
  unlockedLevels,
} from '@/learning/session/level-gate.ts'
import { encodeSkillId, encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { db } from '../database.ts'
import {
  CONTENT_V2_LEVEL_RESET_MIGRATION,
  runContentV2LevelReset,
} from './content-v2-level-reset.repository.ts'
import { clearContentV2Notice, getContentV2Notice, runOnce } from './meta.repository.ts'
import * as settingsRepo from './settings.repository.ts'
import {
  computeLevelPoolCounts,
  getAllWordProgress,
  recomputeAll,
} from './words-progress.repository.ts'

function word(lemma: string, level: LevelValue, rank: number): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank,
    level,
    levels: uniformLevels(level),
    primaryRu: `${lemma}-ru`,
    sensesShard: 0,
    paradigmShard: -1,
  }
}

const KOT = encodeWordId('kot', 'NOUN')
const PIES = encodeWordId('pies', 'NOUN')

/** v2 index: kot, pies — A1 in v1 as well; dom, ser, mleko — A2..B1 in v1, A1 now; woda — A2. */
const V2_INDEX = [
  word('kot', 'A1', 1),
  word('pies', 'A1', 2),
  word('dom', 'A1', 3),
  word('ser', 'A1', 4),
  word('mleko', 'A1', 5),
  word('woda', 'A2', 6),
]

function vocabSkills(wordId: WordId): SkillRecord[] {
  return (['vocab:pl-ru', 'vocab:ru-pl-choice', 'vocab:ru-pl-input'] as const).map((dimension) => ({
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    kind: 'vocab',
    dimension,
    state: 'review',
    stability: 20,
    difficulty: 5,
    due: 50_000,
    lastReviewAt: 1_000,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 100,
    updatedAt: 1_000,
  }))
}

async function startWords(...wordIds: WordId[]): Promise<void> {
  await db.skills.bulkAdd(wordIds.flatMap(vocabSkills))
  await recomputeAll()
}

/** What the home screen / session would see right now. */
async function gate() {
  const startLevel = await settingsRepo.get<LevelValue>(NEW_WORDS_START_LEVEL_SETTING_KEY, 'A1')
  const counts = computeLevelPoolCounts(await getAllWordProgress())
  return {
    startLevel,
    unlocked: unlockedLevels(counts, startLevel),
    currentLevel: currentNewWordLevel(counts, startLevel),
    unstartedA1: counts.unstartedByLevel.A1,
  }
}

beforeEach(async () => {
  await db.open()
  initIndexStore(V2_INDEX)
})

afterEach(async () => {
  vi.restoreAllMocks()
  __resetIndexStoreForTest()
  await db.delete()
})

describe('runContentV2LevelReset', () => {
  it('startLevel B1 + the old A1 fully started: back to A1, and the new A1 words are what is left', async () => {
    await startWords(KOT, PIES)
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'B1')
    // Before: A1 is closed for good — nothing to learn from B1 up in this fixture.
    expect(await gate()).toMatchObject({ startLevel: 'B1', currentLevel: undefined })

    await runContentV2LevelReset()

    expect(await gate()).toEqual({
      startLevel: 'A1',
      unlocked: ['A1'],
      currentLevel: 'A1', // «Сейчас изучаем: A1 · осталось 3»
      unstartedA1: 3,
    })
    const notice = await getContentV2Notice()
    expect(notice?.previousStartLevel).toBe('B1')
    expect(notice?.at).toBeGreaterThan(0)
  })

  it('no unstarted A1 left in v2: the gate lands on the next level, not on an empty screen', async () => {
    initIndexStore([
      word('kot', 'A1', 1),
      word('pies', 'A1', 2),
      word('woda', 'A2', 3),
      word('rzeka', 'A2', 4),
    ])
    await startWords(KOT, PIES)
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'A2')

    await runContentV2LevelReset()

    expect(await gate()).toEqual({
      startLevel: 'A1',
      unlocked: ['A1', 'A2'],
      currentLevel: 'A2',
      unstartedA1: 0,
    })
    expect((await getContentV2Notice())?.previousStartLevel).toBe('A2')
  })

  it('startLevel already A1: the setting is not written, the notice still is (first sentence only)', async () => {
    await startWords(KOT)

    await runContentV2LevelReset()

    expect(await db.settings.get(NEW_WORDS_START_LEVEL_SETTING_KEY)).toBeUndefined()
    expect((await getContentV2Notice())?.previousStartLevel).toBe('A1')
    expect((await gate()).currentLevel).toBe('A1')
  })

  it('an explicit A1 is not rewritten either', async () => {
    await startWords(KOT)
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'A1')
    const setSpy = vi.spyOn(settingsRepo, 'set')

    await runContentV2LevelReset()

    expect(setSpy).not.toHaveBeenCalled()
    expect((await gate()).startLevel).toBe('A1')
  })

  it('does not touch progress: skills, review logs and wordProgress are byte-for-byte the same', async () => {
    await startWords(KOT, PIES)
    await db.reviewLogs.add({
      sessionId: 1,
      skillId: encodeSkillId(KOT, 'vocab:pl-ru'),
      wordId: KOT,
      exerciseType: 'choice',
      reviewedAt: 1_001,
      rating: 3,
      correct: true,
      answerGiven: 'x',
      expected: 'x',
      elapsedMs: 900,
      srsApplied: true,
    })
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'B2')
    const snapshot = async () => ({
      skills: await db.skills.orderBy('skillId').toArray(),
      logs: await db.reviewLogs.toArray(),
      progress: await db.wordProgress.orderBy('wordId').toArray(),
    })
    const before = await snapshot()

    await runContentV2LevelReset()

    expect(await snapshot()).toEqual(before)
  })

  it('a profile without any skill (fresh install): a changed start level is still reset, but no notice is left', async () => {
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'B1')

    await runContentV2LevelReset()

    expect((await gate()).startLevel).toBe('A1')
    expect(await getContentV2Notice()).toBeUndefined()
  })

  it('a fresh install on the default level: nothing is written at all', async () => {
    await runContentV2LevelReset()

    expect(await db.settings.count()).toBe(0)
    expect(await db.meta.count()).toBe(0)
  })

  it('under runOnce a later start does not reset a start level the user changed after the migration', async () => {
    await startWords(KOT)
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'B1')

    expect(await runOnce(CONTENT_V2_LEVEL_RESET_MIGRATION, runContentV2LevelReset)).toBe(true)
    expect((await gate()).startLevel).toBe('A1')

    // The user dismisses the banner and raises the level in settings.
    await clearContentV2Notice()
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'A2')

    expect(await runOnce(CONTENT_V2_LEVEL_RESET_MIGRATION, runContentV2LevelReset)).toBe(false)
    expect((await gate()).startLevel).toBe('A2')
    expect(await getContentV2Notice()).toBeUndefined()
  })
})
