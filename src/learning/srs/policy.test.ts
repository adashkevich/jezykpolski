/**
 * `policy.ts` tests (`spec/tasks/11-srs.md` acceptance points 7-8, plus the §2 rating
 * mapping table and the Rule 1 `shouldApplySrs` restatement).
 */
import { describe, expect, it } from 'vitest'
import { createInitialState, review } from './fsrs-adapter.ts'
import {
  AGAIN,
  applyPracticeDamping,
  capRatingForMode,
  EASY,
  GOOD,
  HARD,
  mapResultToRating,
  PRACTICE_INTERVAL_FACTOR,
  shouldApplySrs,
} from './policy.ts'

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0)

describe('mapResultToRating (architecture.md §6.2)', () => {
  it('incorrect -> Again', () => {
    expect(mapResultToRating({ correct: false, nearMiss: false, answerKind: 'input' })).toBe(AGAIN)
  })

  it('nearMiss -> Hard, regardless of the correct flag grade() reports for it', () => {
    expect(mapResultToRating({ correct: false, nearMiss: true, answerKind: 'input' })).toBe(HARD)
  })

  it('correct choice -> Good', () => {
    expect(mapResultToRating({ correct: true, nearMiss: false, answerKind: 'choice' })).toBe(GOOD)
  })

  it('correct free-text input -> Easy', () => {
    expect(mapResultToRating({ correct: true, nearMiss: false, answerKind: 'input' })).toBe(EASY)
  })

  it('self-assessment passes the user-chosen rating straight through', () => {
    expect(mapResultToRating({ rating: HARD })).toBe(HARD)
    expect(mapResultToRating({ rating: EASY })).toBe(EASY)
  })
})

describe('shouldApplySrs (Rule 1 / FR-103)', () => {
  it('applies only on the first answer to a skill within a session', () => {
    expect(shouldApplySrs(true)).toBe(true)
    expect(shouldApplySrs(false)).toBe(false)
  })
})

describe('Rule 2 / FR-112 — capRatingForMode', () => {
  it('caps Easy down to Good in practice mode', () => {
    expect(capRatingForMode(EASY, 'practice')).toBe(GOOD)
  })

  it('leaves Good, Hard, Again unchanged in practice mode', () => {
    expect(capRatingForMode(GOOD, 'practice')).toBe(GOOD)
    expect(capRatingForMode(HARD, 'practice')).toBe(HARD)
    expect(capRatingForMode(AGAIN, 'practice')).toBe(AGAIN)
  })

  it('never caps anything in learn mode', () => {
    expect(capRatingForMode(EASY, 'learn')).toBe(EASY)
  })
})

describe('Rule 2 / FR-112 — applyPracticeDamping', () => {
  it('PRACTICE_INTERVAL_FACTOR is 0.5', () => {
    expect(PRACTICE_INTERVAL_FACTOR).toBe(0.5)
  })

  it('is a no-op in learn mode', () => {
    const next = review(createInitialState(NOW), GOOD, NOW).next
    expect(applyPracticeDamping(next, 'learn', NOW)).toEqual(next)
  })

  it('scales the interval by PRACTICE_INTERVAL_FACTOR in practice mode', () => {
    const next = review(createInitialState(NOW), GOOD, NOW).next
    const interval = next.due - NOW
    const damped = applyPracticeDamping(next, 'practice', NOW)
    expect(damped.due - NOW).toBe(Math.round(interval * PRACTICE_INTERVAL_FACTOR))
  })

  it('produces a strictly smaller interval than the same rating in learn mode', () => {
    const state = createInitialState(NOW)
    const learnNext = review(state, GOOD, NOW).next
    const practiceNext = applyPracticeDamping(review(state, GOOD, NOW).next, 'practice', NOW)
    expect(practiceNext.due - NOW).toBeLessThan(learnNext.due - NOW)
  })

  it('end-to-end: capped rating + damped interval together stay below the undamped learn result', () => {
    // A user in practice mode "graded" Easy: capRatingForMode brings it down to Good before
    // it ever reaches the adapter, and applyPracticeDamping then halves the resulting
    // interval — the combination task 11 acceptance point 7 asks for.
    const state = createInitialState(NOW)
    const learnEasy = review(state, EASY, NOW).next

    const practiceRating = capRatingForMode(EASY, 'practice')
    expect(practiceRating).toBe(GOOD)
    const practiceNext = applyPracticeDamping(
      review(state, practiceRating, NOW).next,
      'practice',
      NOW,
    )

    expect(practiceNext.due - NOW).toBeLessThan(learnEasy.due - NOW)
  })
})
