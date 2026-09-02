import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { buildLearnQueue } from './build-learn-queue.ts'

function skill(
  overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'due'>,
): SkillRecord {
  return {
    wordId: overrides.skillId.split('::')[0]!,
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function word(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

describe('buildLearnQueue', () => {
  it('orders overdue reviews oldest-due-first, ahead of learning/relearning', () => {
    const oldReview = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100, state: 'review' })
    const newerReview = skill({ skillId: 'b|NOUN::vocab:pl-ru', due: 200, state: 'review' })
    const learning = skill({ skillId: 'c|NOUN::vocab:pl-ru', due: 50, state: 'learning' })

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [learning, newerReview, oldReview],
      newWordsBudget: 0,
      candidateNewWords: [],
      targetSize: 20,
    })

    expect(plan.items.map((i) => (i.source === 'due' ? i.skill.skillId : i.wordId))).toEqual([
      'a|NOUN::vocab:pl-ru', // oldest review due
      'b|NOUN::vocab:pl-ru', // newer review due
      'c|NOUN::vocab:pl-ru', // learning/relearning tier, after all reviews
    ])
  })

  it('newWordsBudget = 0 yields a reviews-only queue', () => {
    const review = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100 })
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [review],
      newWordsBudget: 0,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1 })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ source: 'due' })
  })

  it('an empty due list and empty candidates yields an empty plan', () => {
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 10,
      candidateNewWords: [],
      targetSize: 20,
    })
    expect(plan.items).toEqual([])
  })

  it('takes new words by ascending rank, capped at newWordsBudget', () => {
    const words = [
      word({ lemma: 'c', rank: 30 }),
      word({ lemma: 'a', rank: 10 }),
      word({ lemma: 'b', rank: 20 }),
    ]
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 2,
      candidateNewWords: words,
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(2)
    const lemmas = plan.items.map((i) => (i.source === 'new' ? i.word.lemma : null))
    expect(lemmas).toEqual(['a', 'b'])
  })

  it('creates only a vocab:pl-ru-shaped item for new words (the union carries no skill yet)', () => {
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 1,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1, pos: 'NOUN' })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(1)
    const item = plan.items[0]!
    expect(item.source).toBe('new')
    if (item.source === 'new') {
      expect(item.wordId).toBe('nowy|NOUN')
      // No SkillRecord at all is carried — ensureSkill('vocab:pl-ru') is the caller's job,
      // done lazily once this item is actually about to be shown (see session.types.ts).
      expect('skill' in item).toBe(false)
    }
  })

  it('interleaves new words across the queue instead of appending them as a trailing block', () => {
    const dueSkills = Array.from({ length: 15 }, (_, i) =>
      skill({ skillId: `w${i}|NOUN::vocab:pl-ru`, due: i }),
    )
    const newWords = Array.from({ length: 5 }, (_, i) => word({ lemma: `n${i}`, rank: i }))

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills,
      newWordsBudget: 5,
      candidateNewWords: newWords,
      targetSize: 20,
    })

    expect(plan.items).toHaveLength(20)
    const newPositions = plan.items
      .map((item, index) => (item.source === 'new' ? index : -1))
      .filter((index) => index !== -1)

    expect(newPositions).toHaveLength(5)
    // Not bunched at the very end: the last item must be a review, not a new word — a
    // trailing block of 5 new words would put a 'new' item at index 19.
    expect(plan.items[19]!.source).toBe('due')
    // Not bunched at the very start either — the first item is always a review when any
    // exist (task text: overdue reviews come before new words).
    expect(plan.items[0]!.source).toBe('due')
    // Spread out, not clumped together: consecutive new-word positions should be several
    // apart (roughly every 3rd slot for 15 reviews / 5 new words).
    for (let i = 1; i < newPositions.length; i++) {
      expect(newPositions[i]! - newPositions[i - 1]!).toBeGreaterThanOrEqual(2)
    }
  })

  it('caps the total at targetSize, letting a review backlog crowd out new words entirely', () => {
    const dueSkills = Array.from({ length: 25 }, (_, i) =>
      skill({ skillId: `w${i}|NOUN::vocab:pl-ru`, due: i }),
    )
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills,
      newWordsBudget: 10,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1 })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(20)
    expect(plan.items.every((item) => item.source === 'due')).toBe(true)
    // The 20 kept are the 20 most overdue (smallest `due`), not an arbitrary slice.
    const dues = plan.items.map((item) => (item.source === 'due' ? item.skill.due : -1))
    expect(dues).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })
})
