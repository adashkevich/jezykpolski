/**
 * Persistent progress record types (`spec/tasks/03-domain-model.md` step 5).
 *
 * Types only — writing these to IndexedDB is task 05 (`src/db/**`). No `Date` objects
 * anywhere here: every timestamp is `number` (epoch ms), per the task's hard rule — it
 * indexes cleanly as a Dexie range key and serializes losslessly to JSON for backup export.
 *
 * `SkillRecord` mirrors `spec/architecture.md` §5.3 field-for-field. `WordProgressRecord`
 * mirrors §5.5. `ReviewLogRecord` mirrors §8. `SessionRecord` and `DailyStatsRecord` are
 * only declared as opaque `Table<...>` types in §8 (no field list given there) — their
 * shapes below are this task's own design, inferred from the session-results and stats
 * screens (`spec/app-design.md` §21 "Экран результатов сессии" and §26 "Экран статистики")
 * and the Dexie index strings §8 pins (`'++id, mode, startedAt, endedAt'` /  `'date'`).
 * Treat them as a reasonable starting point that task 05 (or whichever task first writes to
 * these tables) is free to refine once real query patterns are known.
 */
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'

// ---------------------------------------------------------------------------
// Skills (architecture.md §5.3)
// ---------------------------------------------------------------------------

/** Top-level grouping of a skill, derived from the first segment of its `dimension`. */
export type SkillKind = 'vocab' | 'noun' | 'verb' | 'adj' | 'adv'

/** FSRS card state (see `learning/srs/**`, task 11 — not implemented by this task). */
export type SkillState = 'new' | 'learning' | 'review' | 'relearning'

export interface SkillRecord {
  /** Primary key. */
  skillId: SkillId
  wordId: WordId
  kind: SkillKind
  /** The part of `skillId` after `"::"` — duplicated here for indexing without parsing. */
  dimension: string

  // FSRS state (§6 of architecture.md; the adapter itself is task 11).
  state: SkillState
  stability: number
  difficulty: number
  /** epoch ms — indexed by range for "what's due now" queries. */
  due: number
  lastReviewAt?: number
  reps: number
  lapses: number

  // Applied statistics, independent of the FSRS state.
  correct: number
  incorrect: number
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Word progress cache (architecture.md §5.5) — denormalized, fully recomputable from
// `skills` (see `learning/progress/aggregate.ts`). Never a second source of truth.
// ---------------------------------------------------------------------------

/** UI-facing derived status for a word (architecture.md §5.4). */
export type WordStatus = 'new' | 'learning' | 'known' | 'mastered'

export interface WordProgressRecord {
  /** Primary key. */
  wordId: WordId
  status: WordStatus
  /** 0..1 */
  vocabMaturity: number
  /** 0..1 */
  morphMaturity: number
  /** Nearest `due` among the word's skills, if any have been materialized. */
  nextDue?: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Review log (architecture.md §8) — one row per graded answer.
// ---------------------------------------------------------------------------

/**
 * FSRS rating scale (Again / Hard / Good / Easy). Declared locally rather than imported
 * from `ts-fsrs` — `learning/srs/fsrs-adapter.ts` (task 11) is the one place that library
 * is allowed to be imported (architecture.md §3); this numeric scale is stable FSRS
 * vocabulary that a review-log row needs regardless of which adapter module produces it.
 */
export type Rating = 1 | 2 | 3 | 4

export interface ReviewLogRecord {
  /** Auto-increment primary key; absent before insert. */
  id?: number
  sessionId: number
  skillId: SkillId
  wordId: WordId
  /**
   * `Exercise['type']` once `learning/exercises/exercise.types.ts` (task 09) defines the
   * discriminated union. Kept as a plain `string` here to avoid a forward dependency on a
   * module this task must not create.
   */
  exerciseType: string
  reviewedAt: number
  rating: Rating
  correct: boolean
  /** What the user actually typed/picked. */
  answerGiven: string
  /** The accepted answer used to grade this attempt. */
  expected: string
  elapsedMs: number
  /** `false` for an error-review repeat or part of a practice run that skips SRS updates. */
  srsApplied: boolean
}

// ---------------------------------------------------------------------------
// Sessions (architecture.md §8 declares only `sessions!: Table<SessionRecord, number>`
// with index string `'++id, mode, startedAt, endedAt'`; field list is this task's design —
// see file header).
// ---------------------------------------------------------------------------

/** `spec/app-design.md` §24 "Свободная тренировка vs обучение": Learn / Practice. No `Lesson`. */
export type SessionMode = 'learn' | 'practice'

export interface SessionRecord {
  /** Auto-increment primary key; absent before insert. */
  id?: number
  mode: SessionMode
  startedAt: number
  /** epoch ms; absent while the session is still in progress. */
  endedAt?: number
  totalCount: number
  correctCount: number
  /** Skills materialized (first-ever `SkillRecord`) during this session. */
  newSkillCount: number
  reviewedSkillCount: number
}

// ---------------------------------------------------------------------------
// Daily stats (architecture.md §8 declares only `dailyStats!: Table<DailyStatsRecord, string>`
// with index string `'date'`; field list is this task's design — see file header).
// ---------------------------------------------------------------------------

export interface DailyStatsRecord {
  /** Primary key, local calendar day as `YYYY-MM-DD`. */
  date: string
  reviewsCount: number
  correctCount: number
  /** Skills that received their first-ever `SkillRecord` on this day. */
  newSkillsStarted: number
  sessionsCount: number
  timeSpentMs: number
  updatedAt: number
}
