/**
 * `swipe.repository.ts` tests (`spec/tasks/16-swipe-triage.md` acceptance points 1-4).
 *
 * Words use `paradigmShard: -1` (no paradigm — same trick `words-progress.repository.test.ts`
 * uses) so `computeWordProgress` never touches the network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  areChoiceStagesKnown,
  areStagesKnown,
  markWordChoiceStagesKnown,
  markWordKnown,
  markWordStagesKnown,
  markWordUnknown,
  undoTriage,
  VOCAB_STAGE_DIMENSIONS,
} from './swipe.repository.ts'
import { getSkill, getSkillsForWord } from './skills.repository.ts'
import { getWordProgress } from './words-progress.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { SWIPE_KNOWN_INITIAL_STABILITY } from '@/learning/srs/policy.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

function entry(lemma: string): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank: 1,
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: -1,
  }
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  initIndexStore([entry('kobieta')])
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('markWordKnown', () => {
  it('creates all three vocab dimensions in state "review", never touching other skills', async () => {
    await markWordKnown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills).toHaveLength(3)
    expect(skills.map((s) => s.dimension).sort()).toEqual([
      'vocab:pl-ru',
      'vocab:ru-pl-choice',
      'vocab:ru-pl-input',
    ])
    for (const skill of skills) {
      expect(skill.state).toBe('review')
      expect(skill.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
    }
  })

  it('sets the word status to "known", never "mastered" (app-design.md §3 critical rule)', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    const progress = await getWordProgress('kobieta|NOUN')
    expect(progress?.status).toBe('known')
  })

  it('schedules the next review in a few days, not months', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    const skill = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(skill).toBeDefined()
    const dueInDays = (skill!.due - NOW) / DAY_MS
    expect(dueInDays).toBeGreaterThan(0)
    expect(dueInDays).toBeLessThan(14)
  })

  it('is idempotent-shaped: swiping an already-existing skill overwrites its SRS fields but keeps createdAt', async () => {
    const existing: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'learning',
      stability: 1,
      difficulty: 5,
      due: NOW - DAY_MS,
      reps: 3,
      lapses: 1,
      correct: 2,
      incorrect: 1,
      createdAt: NOW - 10 * DAY_MS,
      updatedAt: NOW - DAY_MS,
    }
    await db.skills.put(existing)

    await markWordKnown('kobieta|NOUN', NOW)

    const updated = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(updated?.createdAt).toBe(existing.createdAt)
    expect(updated?.correct).toBe(existing.correct) // applied stats untouched by a swipe
    expect(updated?.incorrect).toBe(existing.incorrect)
    expect(updated?.state).toBe('review')
    expect(updated?.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
  })

  it('never regresses a skill already at or above the known floor (e.g. 75% maturity from real reviews)', async () => {
    const advanced: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 45,
      difficulty: 3,
      due: NOW + 10 * DAY_MS,
      reps: 6,
      lapses: 0,
      correct: 6,
      incorrect: 0,
      createdAt: NOW - 40 * DAY_MS,
      updatedAt: NOW - 2 * DAY_MS,
      lastReviewAt: NOW - 2 * DAY_MS,
    }
    await db.skills.put(advanced)

    await markWordKnown('kobieta|NOUN', NOW)

    const updated = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(updated?.stability).toBe(advanced.stability)
    expect(updated?.state).toBe(advanced.state)
    expect(updated?.due).toBe(advanced.due)
    expect(updated?.reps).toBe(advanced.reps)
    expect(updated?.lastReviewAt).toBe(advanced.lastReviewAt)
  })

  it('evaluates each vocab dimension independently — one can stay advanced while the others are newly raised', async () => {
    const advanced: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 45,
      difficulty: 3,
      due: NOW + 10 * DAY_MS,
      reps: 6,
      lapses: 0,
      correct: 6,
      incorrect: 0,
      createdAt: NOW - 40 * DAY_MS,
      updatedAt: NOW - 2 * DAY_MS,
      lastReviewAt: NOW - 2 * DAY_MS,
    }
    await db.skills.put(advanced)

    await markWordKnown('kobieta|NOUN', NOW)

    const plRu = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(plRu?.stability).toBe(45)

    const ruPlChoice = await getSkill('kobieta|NOUN::vocab:ru-pl-choice')
    expect(ruPlChoice?.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)

    const ruPlInput = await getSkill('kobieta|NOUN::vocab:ru-pl-input')
    expect(ruPlInput?.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
  })
})

describe('markWordChoiceStagesKnown', () => {
  it('creates only vocab:pl-ru and vocab:ru-pl-choice in state "review" — never vocab:ru-pl-input', async () => {
    await markWordChoiceStagesKnown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills.map((s) => s.dimension).sort()).toEqual(['vocab:pl-ru', 'vocab:ru-pl-choice'])
    for (const skill of skills) {
      expect(skill.state).toBe('review')
      expect(skill.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
    }
  })

  it('leaves an existing vocab:ru-pl-input untouched and never regresses an advanced skill', async () => {
    const input: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:ru-pl-input',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:ru-pl-input',
      state: 'learning',
      stability: 2,
      difficulty: 5,
      due: NOW - DAY_MS,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: NOW - 3 * DAY_MS,
      updatedAt: NOW - DAY_MS,
    }
    const advancedPlRu: SkillRecord = {
      ...input,
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 45,
      due: NOW + 10 * DAY_MS,
    }
    await db.skills.bulkPut([input, advancedPlRu])

    await markWordChoiceStagesKnown('kobieta|NOUN', NOW)

    expect(await getSkill('kobieta|NOUN::vocab:ru-pl-input')).toEqual(input)
    expect((await getSkill('kobieta|NOUN::vocab:pl-ru'))?.stability).toBe(45)
    expect((await getSkill('kobieta|NOUN::vocab:ru-pl-choice'))?.stability).toBe(
      SWIPE_KNOWN_INITIAL_STABILITY,
    )
  })
})

describe('areChoiceStagesKnown', () => {
  it('is false for a word with no skills yet', async () => {
    expect(await areChoiceStagesKnown('kobieta|NOUN')).toBe(false)
  })

  it('is false while only one of the two choice stages is at the known floor', async () => {
    await db.skills.put({
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 45,
      difficulty: 3,
      due: NOW + 10 * DAY_MS,
      reps: 6,
      lapses: 0,
      correct: 6,
      incorrect: 0,
      createdAt: NOW - 40 * DAY_MS,
      updatedAt: NOW - 2 * DAY_MS,
    })
    expect(await areChoiceStagesKnown('kobieta|NOUN')).toBe(false)
  })

  it('is true once both choice stages are at or above the floor — the button would be a no-op', async () => {
    await markWordChoiceStagesKnown('kobieta|NOUN', NOW)
    expect(await areChoiceStagesKnown('kobieta|NOUN')).toBe(true)
  })
})

describe('markWordStagesKnown / areStagesKnown — the generic pair the session runner uses', () => {
  it('a vocab:ru-pl-input question\'s "Знаю" marks all three stages known', async () => {
    await markWordStagesKnown('kobieta|NOUN', VOCAB_STAGE_DIMENSIONS, NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills.map((s) => s.dimension).sort()).toEqual([
      'vocab:pl-ru',
      'vocab:ru-pl-choice',
      'vocab:ru-pl-input',
    ])
    for (const skill of skills) {
      expect(skill.state).toBe('review')
      expect(skill.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
    }
  })

  it('the two choice stages being known is NOT enough to hide the button on a typing question', async () => {
    await markWordChoiceStagesKnown('kobieta|NOUN', NOW)

    expect(await areChoiceStagesKnown('kobieta|NOUN')).toBe(true)
    // vocab:ru-pl-input is still below the floor, so "Знаю" there would still change something.
    expect(await areStagesKnown('kobieta|NOUN', VOCAB_STAGE_DIMENSIONS)).toBe(false)
  })

  it('is true for all three stages once the typing question\'s "Знаю" has been used', async () => {
    await markWordStagesKnown('kobieta|NOUN', VOCAB_STAGE_DIMENSIONS, NOW)
    expect(await areStagesKnown('kobieta|NOUN', VOCAB_STAGE_DIMENSIONS)).toBe(true)
  })
})

describe('markWordUnknown', () => {
  it('creates only vocab:pl-ru, in state "new" due now', async () => {
    await markWordUnknown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills).toHaveLength(1)
    expect(skills[0]!.dimension).toBe('vocab:pl-ru')
    expect(skills[0]!.state).toBe('new')
    expect(skills[0]!.due).toBe(NOW)
  })

  it('resets an already-in-progress vocab:pl-ru back to new/due-now', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    await markWordUnknown('kobieta|NOUN', NOW + DAY_MS)

    const skill = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(skill?.state).toBe('new')
    expect(skill?.due).toBe(NOW + DAY_MS)
    // vocab:ru-pl-choice/vocab:ru-pl-input (materialized by the earlier "Знаю") are
    // untouched by "Не знаю".
    const ruPlChoice = await getSkill('kobieta|NOUN::vocab:ru-pl-choice')
    expect(ruPlChoice?.state).toBe('review')
    const ruPlInput = await getSkill('kobieta|NOUN::vocab:ru-pl-input')
    expect(ruPlInput?.state).toBe('review')
  })

  it('still resets fully to new even when prior stability was already at/above the known floor — the monotonic guard added for markWordKnown must not apply here', async () => {
    const advanced: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 50,
      difficulty: 3,
      due: NOW + 10 * DAY_MS,
      reps: 6,
      lapses: 0,
      correct: 6,
      incorrect: 0,
      createdAt: NOW - 40 * DAY_MS,
      updatedAt: NOW - 2 * DAY_MS,
      lastReviewAt: NOW - 2 * DAY_MS,
    }
    await db.skills.put(advanced)

    await markWordUnknown('kobieta|NOUN', NOW)

    const skill = await getSkill('kobieta|NOUN::vocab:pl-ru')
    expect(skill?.state).toBe('new')
    expect(skill?.stability).toBe(0)
    expect(skill?.due).toBe(NOW)
  })
})

describe('undoTriage', () => {
  it('fully reverts markWordKnown on a brand-new word — deletes the skills and the wordProgress row', async () => {
    expect(await getWordProgress('kobieta|NOUN')).toBeUndefined()

    const snapshot = await markWordKnown('kobieta|NOUN', NOW)
    expect(await getWordProgress('kobieta|NOUN')).toBeDefined()

    await undoTriage(snapshot)

    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)
    expect(await getWordProgress('kobieta|NOUN')).toBeUndefined()
  })

  it('restores the exact previous SkillRecord and wordProgress row when one already existed', async () => {
    const existing: SkillRecord = {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'learning',
      stability: 5,
      difficulty: 4,
      due: NOW - DAY_MS,
      reps: 2,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: NOW - 5 * DAY_MS,
      updatedAt: NOW - DAY_MS,
    }
    await db.skills.put(existing)
    const { recomputeWordProgress } = await import('./words-progress.repository.ts')
    await recomputeWordProgress('kobieta|NOUN')
    const progressBefore = await getWordProgress('kobieta|NOUN')

    const snapshot = await markWordKnown('kobieta|NOUN', NOW)
    await undoTriage(snapshot)

    expect(await getSkill('kobieta|NOUN::vocab:pl-ru')).toEqual(existing)
    expect(await getSkill('kobieta|NOUN::vocab:ru-pl')).toBeUndefined()
    expect(await getWordProgress('kobieta|NOUN')).toEqual(progressBefore)
  })

  it('fully reverts markWordUnknown', async () => {
    const snapshot = await markWordUnknown('kobieta|NOUN', NOW)
    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(1)

    await undoTriage(snapshot)

    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)
    expect(await getWordProgress('kobieta|NOUN')).toBeUndefined()
  })
})
