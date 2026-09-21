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
 * `shouldGradeMatch` (task 44, `spec/tasks/44-matching-credit-all-but-mistaken.md`, FR-55)
 * decides whether a correctly matched "Сопоставление" pair is graded at all: every word of
 * the batch is credited except one whose PL or RU tile ever took part in a WRONG pairing
 * (a "tainted" word — with A_pl → B_ru wrong, both A and B are tainted). Replaces task 36's
 * "last 2 pairs are never graded" rule (`MATCHING_UNGRADED_TAIL`, position-based, removed):
 * a batch with no mistakes at all is now credited in full, the forced last pair included.
 * `MatchingExercise.tsx` is the one place that keeps the tainted set and applies this — its
 * consumers (`useMatchingPracticeSession.ts`, `SessionMatchingBlock.tsx`) only read the
 * resulting `graded` flag, so the rule cannot drift between them.
 */

/** Pure domain module: no React, no Dexie (architecture.md §3, `src/learning/**` rule). */
import type { WordId } from '@/learning/skills/skill-id.ts'

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

/**
 * Whether the correct pairing of `wordId` should be graded: `false` once `wordId` is in
 * `tainted` (its PL or RU tile took part in a wrong pairing earlier in this batch). `tainted`
 * is a set, not a counter — a second mistake on an already tainted word changes nothing.
 * A wrong pairing itself is never graded either way (`useMatchingPracticeSession.ts`'s header).
 */
export function shouldGradeMatch(wordId: WordId, tainted: ReadonlySet<WordId>): boolean {
  return !tainted.has(wordId)
}
