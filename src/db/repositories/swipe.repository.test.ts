/**
 * `swipe.repository.ts` tests (`spec/tasks/16-swipe-triage.md` acceptance points 1-4).
 *
 * Words use `paradigmShard: -1` (no paradigm — same trick `words-progress.repository.test.ts`
 * uses) so `computeWordProgress` never touches the network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  forgetWordVocab,
  markWordKnown,
  markWordProductionKnown,
  markWordTranslationKnown,
  markWordUnknown,
  undoTriage,
  wouldMarkKnownChange,
} from './swipe.repository.ts'
import { getSkill, getSkillsForWord } from './skills.repository.ts'
import { getWordProgress } from './words-progress.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { SWIPE_KNOWN_DUE_DAYS, SWIPE_KNOWN_INITIAL_STABILITY } from '@/learning/srs/policy.ts'
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

describe('markWordTranslationKnown (task 40 §3)', () => {
  it('creates all three vocab dimensions — choice stages in "review", vocab:ru-pl-input merely opened (not "known")', async () => {
    await markWordTranslationKnown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills.map((s) => s.dimension).sort()).toEqual([
      'vocab:pl-ru',
      'vocab:ru-pl-choice',
      'vocab:ru-pl-input',
    ])

    for (const dimension of ['vocab:pl-ru', 'vocab:ru-pl-choice'] as const) {
      const skill = skills.find((s) => s.dimension === dimension)!
      expect(skill.state).toBe('review')
      expect(skill.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
      // Задача 41: оба этапа выбора повторяются через SWIPE_KNOWN_DUE_DAYS дней, не раньше.
      expect(skill.due).toBe(NOW + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    }

    // vocab:ru-pl-input is opened (a SkillRecord now exists — the queue can pick it up), but
    // NOT asserted "known": brand-new, due now, exactly `createSwipeUnknownState`'s shape —
    // this is the whole point of `resolveSwipeUnlockedState` over `resolveSwipeKnownState`.
    const input = skills.find((s) => s.dimension === 'vocab:ru-pl-input')!
    expect(input.state).toBe('new')
    expect(input.stability).toBe(0)
    expect(input.due).toBe(NOW)
  })

  it('leaves an existing vocab:ru-pl-input untouched, whatever its own progress — never regresses OR advances it', async () => {
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

    await markWordTranslationKnown('kobieta|NOUN', NOW)

    const afterInput = await getSkill('kobieta|NOUN::vocab:ru-pl-input')
    expect(afterInput?.state).toBe(input.state)
    expect(afterInput?.stability).toBe(input.stability)
    expect(afterInput?.due).toBe(input.due)
    expect((await getSkill('kobieta|NOUN::vocab:pl-ru'))?.stability).toBe(45)
    expect((await getSkill('kobieta|NOUN::vocab:ru-pl-choice'))?.stability).toBe(
      SWIPE_KNOWN_INITIAL_STABILITY,
    )
  })
})

/** Полная запись навыка для `db.skills.put` — то же, что вручную собирают тесты выше. */
function skillAt(
  dimension: 'vocab:pl-ru' | 'vocab:ru-pl-choice' | 'vocab:ru-pl-input',
  stability: number,
): SkillRecord {
  return {
    skillId: `kobieta|NOUN::${dimension}`,
    wordId: 'kobieta|NOUN',
    kind: 'vocab',
    dimension,
    state: stability > 0 ? 'review' : 'new',
    stability,
    difficulty: stability > 0 ? 3 : 0,
    due: NOW + 5 * DAY_MS,
    reps: stability > 0 ? 1 : 0,
    lapses: 0,
    correct: stability > 0 ? 1 : 0,
    incorrect: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('markWordProductionKnown (task 41 §2)', () => {
  it('moves all three stages to "review" at the known floor, due in SWIPE_KNOWN_DUE_DAYS days, in one call', async () => {
    await markWordProductionKnown('kobieta|NOUN', NOW)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills.map((s) => s.dimension).sort()).toEqual([
      'vocab:pl-ru',
      'vocab:ru-pl-choice',
      'vocab:ru-pl-input',
    ])
    for (const skill of skills) {
      expect(skill.state).toBe('review')
      expect(skill.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
      expect(skill.due).toBe(NOW + SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    }
    expect((await getWordProgress('kobieta|NOUN'))?.status).toBe('known')
  })

  it('never lowers a stage already above the known floor (monotonic, per stage)', async () => {
    const advanced = { ...skillAt('vocab:ru-pl-input', 45), due: NOW + 20 * DAY_MS }
    await db.skills.put(advanced)

    await markWordProductionKnown('kobieta|NOUN', NOW)

    const input = await getSkill('kobieta|NOUN::vocab:ru-pl-input')
    expect(input?.stability).toBe(45)
    expect(input?.due).toBe(advanced.due)
    expect((await getSkill('kobieta|NOUN::vocab:pl-ru'))?.stability).toBe(
      SWIPE_KNOWN_INITIAL_STABILITY,
    )
  })

  it('is fully reverted by undoTriage — one snapshot for all three stages', async () => {
    const snapshot = await markWordProductionKnown('kobieta|NOUN', NOW)
    await undoTriage(snapshot)
    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)
  })
})

describe('wouldMarkKnownChange (task 41 §3 — replaces areChoiceStagesKnown)', () => {
  describe('on a choice stage (vocab:pl-ru / vocab:ru-pl-choice)', () => {
    it('is true for a word with no skills yet', async () => {
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:pl-ru')).toBe(true)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-choice')).toBe(true)
    })

    it('is true while only one of the two choice stages is at the known floor', async () => {
      await db.skills.put(skillAt('vocab:pl-ru', 45))
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:pl-ru')).toBe(true)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-choice')).toBe(true)
    })

    it('is true when both choice stages are known but vocab:ru-pl-input has not been opened yet — the button would still open it', async () => {
      await db.skills.bulkPut([
        skillAt('vocab:pl-ru', SWIPE_KNOWN_INITIAL_STABILITY),
        skillAt('vocab:ru-pl-choice', SWIPE_KNOWN_INITIAL_STABILITY),
      ])
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:pl-ru')).toBe(true)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-choice')).toBe(true)
    })

    it('is false once both choice stages are known AND vocab:ru-pl-input exists — the button would be a no-op', async () => {
      await markWordTranslationKnown('kobieta|NOUN', NOW)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:pl-ru')).toBe(false)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-choice')).toBe(false)
    })

    it('does not care how far vocab:ru-pl-input has got — an opened input record is never touched by the button', async () => {
      await markWordTranslationKnown('kobieta|NOUN', NOW)
      await db.skills.put({ ...skillAt('vocab:ru-pl-input', 1), state: 'learning' })
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:pl-ru')).toBe(false)
    })
  })

  describe('on vocab:ru-pl-input', () => {
    it('is true for a word with no skills yet', async () => {
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-input')).toBe(true)
    })

    it('is true when the two choice stages are known but the input itself is still below the floor — exactly what a choice-only check would hide wrongly', async () => {
      await markWordTranslationKnown('kobieta|NOUN', NOW)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-input')).toBe(true)
    })

    it('is true while any one of the three stages is below the floor', async () => {
      await db.skills.bulkPut([
        skillAt('vocab:pl-ru', SWIPE_KNOWN_INITIAL_STABILITY),
        skillAt('vocab:ru-pl-choice', 2),
        skillAt('vocab:ru-pl-input', SWIPE_KNOWN_INITIAL_STABILITY),
      ])
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-input')).toBe(true)
    })

    it('is false only when all three stages are at or above the known floor', async () => {
      await markWordKnown('kobieta|NOUN', NOW)
      expect(await wouldMarkKnownChange('kobieta|NOUN', 'vocab:ru-pl-input')).toBe(false)
    })
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

describe('forgetWordVocab', () => {
  it('deletes all three vocab skills, leaving non-vocab skills untouched', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    const morphSkill: SkillRecord = {
      skillId: 'kobieta|NOUN::noun:sg:instrumental',
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:instrumental',
      state: 'review',
      stability: 30,
      difficulty: 3,
      due: NOW,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: NOW,
      updatedAt: NOW,
    }
    await db.skills.put(morphSkill)

    await forgetWordVocab('kobieta|NOUN')

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills).toHaveLength(1)
    expect(skills[0]!.kind).toBe('noun')
  })

  it('recomputes wordProgress rather than deleting it when non-vocab skills remain', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    const morphSkill: SkillRecord = {
      skillId: 'kobieta|NOUN::noun:sg:instrumental',
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:instrumental',
      state: 'review',
      stability: 30,
      difficulty: 3,
      due: NOW,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: NOW,
      updatedAt: NOW,
    }
    await db.skills.put(morphSkill)

    await forgetWordVocab('kobieta|NOUN')

    const progress = await getWordProgress('kobieta|NOUN')
    expect(progress).toBeDefined()
    expect(progress?.vocabMaturity).toBe(0)
  })

  it('deletes the wordProgress row when no skill remains at all', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    expect(await getWordProgress('kobieta|NOUN')).toBeDefined()

    await forgetWordVocab('kobieta|NOUN')

    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)
    expect(await getWordProgress('kobieta|NOUN')).toBeUndefined()
  })

  it('is a no-op snapshot when the word has no vocab skills yet', async () => {
    const snapshot = await forgetWordVocab('kobieta|NOUN')
    expect(snapshot.previousSkills.size).toBe(0)
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

  it('fully reverts forgetWordVocab — a delete, not a put, is restored just as well', async () => {
    await markWordKnown('kobieta|NOUN', NOW)
    const snapshot = await forgetWordVocab('kobieta|NOUN')
    expect(await getSkillsForWord('kobieta|NOUN')).toHaveLength(0)

    await undoTriage(snapshot)

    const skills = await getSkillsForWord('kobieta|NOUN')
    expect(skills).toHaveLength(3)
    expect(skills.every((s) => s.state === 'review')).toBe(true)
    expect(await getWordProgress('kobieta|NOUN')).toBeDefined()
  })
})
