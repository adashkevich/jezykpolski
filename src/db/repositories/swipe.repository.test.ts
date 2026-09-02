/**
 * `swipe.repository.ts` tests (`spec/tasks/16-swipe-triage.md` acceptance points 1-4).
 *
 * Words use `paradigmShard: -1` (no paradigm — same trick `words-progress.repository.test.ts`
 * uses) so `computeWordProgress` never touches the network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { markWordKnown, markWordUnknown, undoTriage } from './swipe.repository.ts'
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
  it('creates vocab:pl-ru and vocab:ru-pl in state "review", never touching other skills', async () => {
    await markWordKnown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills).toHaveLength(2)
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
    // vocab:ru-pl (materialized by the earlier "Знаю") is untouched by "Не знаю".
    const ruPl = await getSkill('kobieta|NOUN::vocab:ru-pl')
    expect(ruPl?.state).toBe('review')
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
