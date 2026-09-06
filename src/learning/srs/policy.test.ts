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
  createSwipeKnownState,
  createSwipeUnknownState,
  EASY,
  GOOD,
  HARD,
  mapResultToRating,
  PRACTICE_INTERVAL_FACTOR,
  resolveSwipeKnownState,
  shouldApplySrs,
  SWIPE_KNOWN_DUE_DAYS,
  SWIPE_KNOWN_INITIAL_STABILITY,
} from './policy.ts'
import type { SkillRecord } from '@/types/progress.ts'
import {
  KNOWN_THRESHOLD,
  MASTERED_THRESHOLD,
  TARGET_STABILITY_DAYS,
} from '@/learning/progress/aggregate.ts'

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

describe('mapResultToRating — typed letter-by-letter attempts (задача 29, FR-84/85/86)', () => {
  it('clean attempt (no mistakes, no hints) -> Easy', () => {
    expect(mapResultToRating({ mistakes: 0, hintsUsed: 0, revealed: false, letterCount: 5 })).toBe(
      EASY,
    )
  })

  it('at least one mistake -> Hard, not Again', () => {
    expect(mapResultToRating({ mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 5 })).toBe(
      HARD,
    )
  })

  it('at least one hint used -> Hard', () => {
    expect(mapResultToRating({ mistakes: 0, hintsUsed: 1, revealed: false, letterCount: 5 })).toBe(
      HARD,
    )
  })

  it('revealed ("глазок") -> Again', () => {
    expect(mapResultToRating({ mistakes: 0, hintsUsed: 0, revealed: true, letterCount: 5 })).toBe(
      AGAIN,
    )
  })

  it('every letter opened via hints (revealed === false) is treated the same as "глазок"', () => {
    expect(mapResultToRating({ mistakes: 0, hintsUsed: 5, revealed: false, letterCount: 5 })).toBe(
      AGAIN,
    )
  })

  it('Hard from a typed attempt is still capped further by Practice mode, same as any other rating', () => {
    const rating = mapResultToRating({
      mistakes: 1,
      hintsUsed: 0,
      revealed: false,
      letterCount: 5,
    })
    expect(capRatingForMode(rating, 'practice')).toBe(HARD)
    expect(
      capRatingForMode(
        mapResultToRating({ mistakes: 0, hintsUsed: 0, revealed: false, letterCount: 5 }),
        'practice',
      ),
    ).toBe(GOOD)
  })
})

describe('shouldApplySrs (Rule 1 / FR-103)', () => {
  it('applies only on the first answer to a skill within a session (learn/practice)', () => {
    expect(shouldApplySrs(true, 'learn')).toBe(true)
    expect(shouldApplySrs(false, 'learn')).toBe(false)
    expect(shouldApplySrs(true, 'practice')).toBe(true)
    expect(shouldApplySrs(false, 'practice')).toBe(false)
  })

  it('mode "mistakes" (task 14) always returns false, even on a first answer', () => {
    expect(shouldApplySrs(true, 'mistakes')).toBe(false)
    expect(shouldApplySrs(false, 'mistakes')).toBe(false)
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

describe('Swipe triage (task 16, FR-29) — SWIPE_KNOWN_INITIAL_STABILITY', () => {
  it('maturity (stability / TARGET_STABILITY_DAYS) lands inside the "known" band, never "mastered"', () => {
    // The whole point of this constant (app-design.md §3's critical rule: swipe-right must
    // NOT mean "выучено"): plugging it into aggregate.ts's own thresholds must read as
    // `known`, never `mastered`, and this must keep holding even if those thresholds are
    // retuned later — hence comfortable margin on both sides, not just clearing the bar.
    const maturity = SWIPE_KNOWN_INITIAL_STABILITY / TARGET_STABILITY_DAYS
    expect(maturity).toBeGreaterThanOrEqual(KNOWN_THRESHOLD)
    expect(maturity).toBeLessThan(MASTERED_THRESHOLD)
  })

  it('is a positive, moderate number of days (not 0, not TARGET_STABILITY_DAYS itself)', () => {
    expect(SWIPE_KNOWN_INITIAL_STABILITY).toBeGreaterThan(0)
    expect(SWIPE_KNOWN_INITIAL_STABILITY).toBeLessThan(TARGET_STABILITY_DAYS)
  })
})

describe('createSwipeKnownState', () => {
  it('produces a "review"-state skill at SWIPE_KNOWN_INITIAL_STABILITY, self-reported as just reviewed', () => {
    const state = createSwipeKnownState(NOW)
    expect(state.state).toBe('review')
    expect(state.stability).toBe(SWIPE_KNOWN_INITIAL_STABILITY)
    expect(state.reps).toBe(1)
    expect(state.lapses).toBe(0)
    expect(state.lastReviewAt).toBe(NOW)
    expect(state.difficulty).toBeGreaterThan(0)
  })

  it('schedules the next due date a few days out — SWIPE_KNOWN_DUE_DAYS, not the stability itself', () => {
    const state = createSwipeKnownState(NOW)
    const DAY_MS = 24 * 60 * 60 * 1000
    expect(state.due - NOW).toBe(SWIPE_KNOWN_DUE_DAYS * DAY_MS)
    // The critical part of the app-design.md §3 rule restated numerically: due must come
    // much sooner than the moderate stability chosen above would "normally" imply (a real
    // FSRS review at this app's default 90% request_retention schedules ~stability days
    // out) — a swipe is a self-report the app deliberately rechecks soon, not a trusted
    // full-length review.
    expect(SWIPE_KNOWN_DUE_DAYS).toBeLessThan(SWIPE_KNOWN_INITIAL_STABILITY)
    expect((state.due - NOW) / DAY_MS).toBeLessThan(14) // "несколько дней, а не месяцы"
  })
})

describe('createSwipeUnknownState', () => {
  it('is exactly a brand-new card — state "new", due now, zero stability/difficulty/reps/lapses', () => {
    expect(createSwipeUnknownState(NOW)).toEqual(createInitialState(NOW))
  })
})

describe('resolveSwipeKnownState', () => {
  function skillWithStability(stability: number): SkillRecord {
    return {
      skillId: 'kobieta|NOUN::vocab:pl-ru',
      wordId: 'kobieta|NOUN',
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability,
      difficulty: 4,
      due: NOW + 10 * 24 * 60 * 60 * 1000,
      reps: 5,
      lapses: 0,
      correct: 4,
      incorrect: 1,
      createdAt: NOW - 30 * 24 * 60 * 60 * 1000,
      updatedAt: NOW - 24 * 60 * 60 * 1000,
      lastReviewAt: NOW - 24 * 60 * 60 * 1000,
    }
  }

  it('with no previous skill, behaves exactly like createSwipeKnownState', () => {
    expect(resolveSwipeKnownState(undefined, NOW)).toEqual(createSwipeKnownState(NOW))
  })

  it('with previous stability below the floor, still raises to createSwipeKnownState', () => {
    expect(resolveSwipeKnownState(skillWithStability(1), NOW)).toEqual(createSwipeKnownState(NOW))
  })

  it('with previous stability exactly at the floor, keeps the previous state unchanged (>=, not >)', () => {
    const previous = skillWithStability(SWIPE_KNOWN_INITIAL_STABILITY)
    const resolved = resolveSwipeKnownState(previous, NOW)
    expect(resolved.stability).toBe(previous.stability)
    expect(resolved.due).toBe(previous.due)
    expect(resolved.lastReviewAt).toBe(previous.lastReviewAt)
  })

  it('with previous stability above the floor (e.g. 75% maturity), never regresses it — a "Знаю" tap is a no-op', () => {
    const previous = skillWithStability(45)
    const resolved = resolveSwipeKnownState(previous, NOW)
    expect(resolved).toEqual({
      state: previous.state,
      stability: previous.stability,
      difficulty: previous.difficulty,
      due: previous.due,
      reps: previous.reps,
      lapses: previous.lapses,
      lastReviewAt: previous.lastReviewAt,
    })
  })
})
