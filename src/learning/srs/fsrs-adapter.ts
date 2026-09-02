/**
 * `fsrs-adapter.ts` — the ONE file in the whole project allowed to import `ts-fsrs`
 * (`spec/tasks/11-srs.md` §1, `spec/architecture.md` §6.1, blueprint §13/§36.11).
 * `eslint.config.js` enforces this with a `no-restricted-imports` rule scoped to every other
 * file (see that file's comment for why the restriction is split across several
 * non-overlapping scopes rather than one blanket "ban ts-fsrs, exempt this file" block).
 *
 * Everything outside this module calls the four functions below and only ever sees the
 * app's own `SrsState`/`SrsLogEntry`/`Rating` types (`srs.types.ts`, `types/progress.ts`).
 * No `ts-fsrs` type — `Card`, `State`, `Grade`, `RecordLogItem`, ... — appears in any
 * exported signature here. `toCard`/`fromCard` do the (lossless, for the 7 domain fields —
 * see `roundTripThroughCard`'s doc comment) conversion and stay private.
 *
 * All timestamps in/out are `number` (epoch ms) — task 11 hard rule 4. `ts-fsrs` itself
 * speaks `Date` internally (`Card.due`, `Card.last_review`); that conversion is entirely
 * contained in `toCard`/`fromCard` below and never leaks past this file.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  State as FsrsCardState,
  type Card,
  type Grade,
} from 'ts-fsrs'
import type { Rating, SkillState } from '@/types/progress.ts'
import type { SrsLogEntry, SrsState } from './srs.types.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * One module-level scheduler, library defaults (`request_retention: 0.9`, default weights,
 * ...) except for `learning_steps` — see the long comment below. Nothing else in this task
 * asks for custom FSRS parameters, and `fsrs()` is cheap/stateless to construct, so a single
 * shared instance is simplest — there's no per-user or per-skill FSRS configuration yet.
 *
 * `learning_steps: ['10m']` (a single same-day step, down from `ts-fsrs`'s own two-step
 * `['1m', '10m']` default) — NOT a style preference, a correctness fix forced by `SrsState`'s
 * field list (architecture.md §6.1: `state/stability/difficulty/due/reps/lapses/
 * lastReviewAt`, deliberately no `learning_steps`). `ts-fsrs` tracks *which* short-term step
 * a card is on via `Card.learning_steps`, an index that only lives inside one `review()`
 * call's input/output — `toCard()` below has nothing to put there but `0` on every call,
 * since it's rebuilding the card from a persisted `SrsState` each time. With the *default*
 * two-step sequence that reset is catastrophic: verified empirically (see
 * `fsrs-adapter.test.ts`) that a card graded `Good` repeatedly forever alternates between
 * step 0 -> step 1 -> (persisted, reloaded, back to step 0) -> step 1 -> ... and NEVER
 * reaches `Review`, no matter how many real reviews it gets — because `ts-fsrs` only
 * graduates a `Good`/`Easy`-rated card past the *last* step of the sequence, and this
 * adapter can never represent "already on the last step" for a 2+-step sequence once it's
 * been persisted and reloaded. A single-step sequence sidesteps the problem entirely: step 0
 * is *always* the last step, so `Good`/`Easy` graduate to `Review` the moment they're rated
 * that way (regardless of how many times the card has round-tripped through storage), while
 * `Again`/`Hard` still correctly keep the card in `learning`/`relearning` (re-scheduled
 * later that same day) until a passing grade arrives — the `state` transitions
 * architecture.md §6/§7.2 (picker.ts's `state === 'learning'` branches) depend on are all
 * still reachable, just without minute-level step granularity we have nowhere to store.
 * `relearning_steps` needs no override — `ts-fsrs`'s own default there is already a single
 * `'10m'` step, so the same failure mode never applied to it.
 */
const scheduler = fsrs(generatorParameters({ learning_steps: ['10m'] }))

const APP_TO_FSRS_STATE: Record<SkillState, FsrsCardState> = {
  new: FsrsCardState.New,
  learning: FsrsCardState.Learning,
  review: FsrsCardState.Review,
  relearning: FsrsCardState.Relearning,
}

const FSRS_TO_APP_STATE: Record<FsrsCardState, SkillState> = {
  [FsrsCardState.New]: 'new',
  [FsrsCardState.Learning]: 'learning',
  [FsrsCardState.Review]: 'review',
  [FsrsCardState.Relearning]: 'relearning',
}

/**
 * `SrsState -> ts-fsrs Card`. `elapsed_days`/`scheduled_days`/`learning_steps` are Card
 * fields our domain type doesn't carry (architecture.md §5.3's field list stops at
 * `state/stability/difficulty/due/reps/lapses/lastReviewAt`) — they're filled with `0`,
 * which `ts-fsrs` treats as "not mid-(re)learning-step" (verified against the installed
 * 5.4.2 source: `elapsed_days` is recomputed from `last_review`→`now` on every `review()`
 * call regardless of the input value, and a `0`/falsy `learning_steps` simply means "start
 * this (re)learning sequence from its first step" rather than resuming a partially-stepped
 * one). Concretely this means a multi-step in-session (re)learning sequence always restarts
 * at step 1 rather than resuming mid-sequence across two separate `review()` calls — an
 * accepted simplification given the domain model's field list, not a bug.
 */
function toCard(state: SrsState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: state.reps,
    lapses: state.lapses,
    state: APP_TO_FSRS_STATE[state.state],
    last_review: state.lastReviewAt === undefined ? undefined : new Date(state.lastReviewAt),
  }
}

/** `ts-fsrs Card -> SrsState`. Inverse of `toCard` for the 7 domain fields. */
function fromCard(card: Card): SrsState {
  return {
    state: FSRS_TO_APP_STATE[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.getTime(),
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review === undefined ? undefined : card.last_review.getTime(),
  }
}

/**
 * Exposed purely so a test outside this file can verify the `SrsState -> Card -> SrsState`
 * round trip loses none of the 7 domain fields (task 11 acceptance) without that test
 * needing to import `ts-fsrs` itself or reference its `Card` type — this function's
 * signature is `SrsState -> SrsState`, so no `ts-fsrs` type crosses the adapter boundary
 * even here. Not used by any production code path; `review()` always goes through the
 * scheduler, never this bare round trip.
 */
export function roundTripThroughCard(state: SrsState): SrsState {
  return fromCard(toCard(state))
}

/** A brand-new, never-reviewed skill's initial FSRS state (`ts-fsrs`'s `createEmptyCard`). */
export function createInitialState(now: number): SrsState {
  return fromCard(createEmptyCard(new Date(now)))
}

/**
 * Grades one review. `rating` is the app's own `1|2|3|4` (Again/Hard/Good/Easy) scale, which
 * is numerically identical to `ts-fsrs`'s `Grade` (`Rating.Again=1 .. Rating.Easy=4`,
 * `Rating.Manual=0` excluded) by construction (`types/progress.ts`'s `Rating` doc comment) —
 * the cast below relies on that documented equivalence, not a coincidence.
 */
export function review(
  state: SrsState,
  rating: Rating,
  now: number,
): { next: SrsState; log: SrsLogEntry } {
  const reviewDate = new Date(now)
  const { card: nextCard } = scheduler.next(toCard(state), reviewDate, rating as Grade)
  const next = fromCard(nextCard)

  const elapsedDays =
    state.lastReviewAt === undefined ? 0 : Math.round((now - state.lastReviewAt) / MS_PER_DAY)
  const scheduledDays = Math.round((next.due - now) / MS_PER_DAY)

  return {
    next,
    log: {
      rating,
      reviewedAt: now,
      previousState: state.state,
      nextState: next.state,
      scheduledDays,
      elapsedDays,
    },
  }
}

/**
 * The resulting interval (`next.due - now`, in ms) for each of the 4 ratings, without
 * committing to any of them — what a "grading" screen would show under each button
 * (`Again in 10m · Hard in 1d · Good in 3d · Easy in 6d`, etc.).
 */
export function previewIntervals(state: SrsState, now: number): Record<Rating, number> {
  const card = toCard(state)
  const preview = scheduler.repeat(card, new Date(now))
  return {
    1: preview[1].card.due.getTime() - now,
    2: preview[2].card.due.getTime() - now,
    3: preview[3].card.due.getTime() - now,
    4: preview[4].card.due.getTime() - now,
  }
}

export function isDue(state: SrsState, now: number): boolean {
  return state.due <= now
}

/**
 * FSRS's own "first-ever rating" difficulty (`init_difficulty(rating)` — see the excerpt in
 * this function's call site, `policy.ts#createSwipeKnownState`) for a brand-new card, without
 * running a real `review()` (there is no exercise/grading event behind a swipe — task 16,
 * `spec/tasks/16-swipe-triage.md` §2). Exposed here rather than hand-copying the constant
 * `ts-fsrs`'s default weights currently produce, so a swiped-known skill's `difficulty` stays
 * whatever the *installed* `ts-fsrs` version's weights say a first "Good" is worth, even if a
 * future dependency bump changes them — this is the one file allowed to know that.
 * `stability`/`due` are deliberately NOT read off this same `next()` call — see the policy
 * module for why swipe-triage picks those independently instead of trusting a fresh card's
 * real first-review numbers (they'd be far too low: a brand-new card's first "Good" stability
 * is a couple of days, not the "already know this word" signal a swipe means).
 */
export function initialDifficultyFor(rating: Rating, now: number): number {
  const { card } = scheduler.next(createEmptyCard(new Date(now)), new Date(now), rating as Grade)
  return card.difficulty
}
