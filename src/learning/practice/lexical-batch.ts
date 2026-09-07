/**
 * Batch-sampling helpers shared by the three POS-independent lexical drills on
 * `TrainingSetupScreen` — "Выбор перевода", "Написание по-польски", "Сопоставление"
 * (`spec/tasks/36-practice-screen-restructure.md` §1/§4, FR-147/FR-152).
 *
 * `sampleWordBatch` is `TrainingSetupScreen.tsx`'s own former `seededSample` (task 27/31),
 * moved here now that it has three call sites (the screen's own launch handlers, plus
 * `SessionResultPage`'s and `MatchingPracticePage`'s "Ещё" — see `session-scope.ts`'s
 * `LexicalWordFilter`/`resolveLexicalCandidateWordIds`) instead of just one. Same small local
 * mulberry32 PRNG every other seeded-sample site in this codebase copies rather than imports
 * (see `learning/session/build-practice-queue.ts`'s own header on why).
 *
 * `MATCHING_UNGRADED_TAIL`/`shouldGradeMatch` are new in task 36 (§4): with only 2 pairs left
 * unmatched in a "Сопоставление" batch, the correct pairing is no longer evidence of
 * knowledge — the second-to-last pair is a 50/50 guess (whichever PL tile is left has exactly
 * one remaining RU tile to try), and the last pair requires no choice at all (both remaining
 * tiles are forced). `useMatchingPracticeSession.ts#gradePair` uses this to skip
 * `submitAnswer`/`reviewLogs`/SRS entirely for the tail, while `MatchingExercise.tsx` keeps
 * showing the same green highlight for every correct pair regardless — the user should never
 * see a difference in feedback, only the review log should reflect one.
 */

/** Pure domain module: no React, no Dexie (architecture.md §3, `src/learning/**` rule). */

/**
 * Deterministic sample of `n` distinct items out of `items`, shuffled by a seeded mulberry32
 * PRNG (not `Math.random()` — repeatable given the same seed, which callers use to get a
 * *different* batch on each "Начать"/"Ещё" by seeding with `Date.now()`). `n` larger than
 * `items.length` returns every item (still shuffled); `n <= 0` returns an empty array.
 */
export function sampleWordBatch<T>(items: readonly T[], n: number, seed: number): T[] {
  let a = seed >>> 0
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, Math.max(0, n))
}

/** "Сопоставление" batch size (`spec/tasks/27-context-and-error-analysis.md` §4/§5),
 *  unchanged since task 27 — moved here from `TrainingSetupScreen.tsx` in task 36. */
export const MATCHING_PAIR_COUNT = 5

/** Batch size for "Выбор перевода"/"Написание по-польски" (`spec/tasks/31-practice-vocabulary-drills.md`
 *  §3) — moved here from `TrainingSetupScreen.tsx` in task 36. Fewer words are used when the
 *  current selection has fewer than this many (never padded). */
export const VOCAB_DRILL_BATCH_SIZE = 10

/** How many of the last pairs in a "Сопоставление" batch are excluded from grading
 *  (task 36 §4) — see this module's header for why 2. */
export const MATCHING_UNGRADED_TAIL = 2

/**
 * Whether the `matchIndex`-th pairing made (0-based, in the order the user completes them —
 * not the tiles' on-screen position) in a batch of `totalPairs` should be graded at all. The
 * last `MATCHING_UNGRADED_TAIL` pairings of any batch are never graded, regardless of
 * `totalPairs` — a batch with `totalPairs <= MATCHING_UNGRADED_TAIL` (possible when the
 * current lexical filter matches fewer than `MATCHING_PAIR_COUNT` words, though
 * `TrainingSetupScreen` normally disables "Начать" before that happens) grades nothing at
 * all, which is the correct degenerate case: every pairing in a 2-pair batch is a guess.
 */
export function shouldGradeMatch(matchIndex: number, totalPairs: number): boolean {
  return matchIndex < totalPairs - MATCHING_UNGRADED_TAIL
}
