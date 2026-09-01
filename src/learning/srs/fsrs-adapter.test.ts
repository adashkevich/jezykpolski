/**
 * `fsrs-adapter.ts` tests (`spec/tasks/11-srs.md` acceptance points 3-5).
 */
import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  isDue,
  previewIntervals,
  review,
  roundTripThroughCard,
} from './fsrs-adapter.ts'
import { AGAIN, EASY, GOOD, HARD } from './policy.ts'
import type { SrsState } from './srs.types.ts'

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

describe('createInitialState', () => {
  it('starts a brand-new card at state "new", due now, zero stability/difficulty/reps/lapses', () => {
    const state = createInitialState(NOW)
    expect(state).toEqual<SrsState>({
      state: 'new',
      stability: 0,
      difficulty: 0,
      due: NOW,
      reps: 0,
      lapses: 0,
      lastReviewAt: undefined,
    })
  })
})

describe('review', () => {
  it('Again keeps the card due within the current day', () => {
    const initial = createInitialState(NOW)
    const { next } = review(initial, AGAIN, NOW)
    expect(next.due).toBeGreaterThanOrEqual(NOW)
    expect(next.due - NOW).toBeLessThan(DAY_MS)
  })

  it('Easy schedules a longer interval than Good from the same starting state', () => {
    const initial = createInitialState(NOW)
    const good = review(initial, GOOD, NOW)
    const easy = review(initial, EASY, NOW)
    expect(easy.next.due - NOW).toBeGreaterThan(good.next.due - NOW)
  })

  it('advances reps and records the previous/next state in the log', () => {
    const initial = createInitialState(NOW)
    const { next, log } = review(initial, GOOD, NOW)
    expect(next.reps).toBe(1)
    expect(log.rating).toBe(GOOD)
    expect(log.reviewedAt).toBe(NOW)
    expect(log.previousState).toBe('new')
    expect(log.nextState).toBe(next.state)
  })

  it('a passing grade (Good) graduates a new card straight to "review"', () => {
    // Single learning step by construction (see fsrs-adapter.ts's scheduler comment) — Good
    // graduates on the very first review, regardless of how many times the card has
    // round-tripped through storage before this call.
    const { next } = review(createInitialState(NOW), GOOD, NOW)
    expect(next.state).toBe('review')
    expect(next.reps).toBe(1)
  })

  it('a non-passing grade (Hard) keeps a new card in "learning", scheduled later the same day', () => {
    const { next } = review(createInitialState(NOW), HARD, NOW)
    expect(next.state).toBe('learning')
    expect(next.due).toBeGreaterThan(NOW)
    expect(next.due - NOW).toBeLessThan(DAY_MS)
  })

  it('repeated Hard never gets permanently stuck in "learning" — a later Good still graduates it', () => {
    // Regression test for the bug this adapter's `learning_steps: ["10m"]` override fixes:
    // with ts-fsrs's own multi-step default, resetting the step index on every persisted
    // round trip (unavoidable — SrsState has no field for it) means a card can loop between
    // steps forever and never reach "review". Simulate several independent review() calls —
    // each rebuilding SrsState from scratch, exactly like separate sessions would — and
    // confirm a passing grade always eventually graduates it.
    let state = createInitialState(NOW)
    let now = NOW
    for (let i = 0; i < 5; i++) {
      const result = review(state, HARD, now)
      expect(result.next.state).toBe('learning')
      state = result.next
      now = state.due
    }
    const graduated = review(state, GOOD, now)
    expect(graduated.next.state).toBe('review')
  })

  it('Again on an established "review" card lapses it into "relearning"', () => {
    const reviewed = review(createInitialState(NOW), GOOD, NOW).next
    expect(reviewed.state).toBe('review')
    const laterNow = NOW + 30 * DAY_MS
    const lapsed = review(reviewed, AGAIN, laterNow)
    expect(lapsed.next.state).toBe('relearning')
    expect(lapsed.next.lapses).toBe(reviewed.lapses + 1)
  })

  it('a passing grade after "relearning" graduates back to "review"', () => {
    const reviewed = review(createInitialState(NOW), GOOD, NOW).next
    const lapsed = review(reviewed, AGAIN, NOW + 30 * DAY_MS).next
    expect(lapsed.state).toBe('relearning')
    const recovered = review(lapsed, GOOD, lapsed.due)
    expect(recovered.next.state).toBe('review')
  })
})

describe('previewIntervals', () => {
  it('previews a strictly increasing interval from Again to Easy without mutating the input', () => {
    const initial = createInitialState(NOW)
    const preview = review(
      review(createInitialState(NOW), GOOD, NOW).next,
      GOOD,
      NOW + 5 * DAY_MS,
    ).next
    const intervals = previewIntervals(preview, NOW + 5 * DAY_MS)
    expect(intervals[HARD]).toBeGreaterThanOrEqual(0)
    expect(intervals[GOOD]).toBeGreaterThan(intervals[HARD])
    expect(intervals[EASY]).toBeGreaterThan(intervals[GOOD])
    // Previewing must not have changed the state actually passed to `review()` next.
    expect(initial.reps).toBe(0)
  })
})

describe('isDue', () => {
  it('is due once `due <= now`, not due before that', () => {
    const state = createInitialState(NOW)
    expect(isDue(state, NOW)).toBe(true)
    expect(isDue(state, NOW - 1)).toBe(false)
    expect(isDue({ ...state, due: NOW + DAY_MS }, NOW)).toBe(false)
  })
})

describe('roundTripThroughCard (SrsState -> Card -> SrsState)', () => {
  it('preserves every domain field for a freshly-created state', () => {
    const state = createInitialState(NOW)
    expect(roundTripThroughCard(state)).toEqual(state)
  })

  it('preserves every domain field for an arbitrary mid-review state, including lastReviewAt', () => {
    const state: SrsState = {
      state: 'review',
      stability: 15.375,
      difficulty: 4.2,
      due: NOW + 12 * DAY_MS,
      reps: 7,
      lapses: 2,
      lastReviewAt: NOW - 3 * DAY_MS,
    }
    expect(roundTripThroughCard(state)).toEqual(state)
  })

  it('preserves each of the 4 FSRS states across the round trip', () => {
    for (const s of ['new', 'learning', 'review', 'relearning'] as const) {
      const state: SrsState = {
        state: s,
        stability: 3,
        difficulty: 5,
        due: NOW,
        reps: 1,
        lapses: 0,
        lastReviewAt: undefined,
      }
      expect(roundTripThroughCard(state).state).toBe(s)
    }
  })
})
