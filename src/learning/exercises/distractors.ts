/**
 * Distractor selection for `choice` / `form-choice` exercises
 * (`spec/architecture.md` §7.4, `spec/tasks/10-distractors.md`).
 *
 * ---------------------------------------------------------------------------------------
 * STUB NOTICE (per this task's supervisor-approved resolution of the 09/10 dependency
 * cycle): task 09 (`generateExercise`, this task) needs *something* to fill `options` on
 * `choice`/`form-choice` exercises, but the real algorithm — rank/level-bounded candidate
 * pools, translation-intersection exclusion so `znać`/`wiedzieć` can't both appear as
 * "correct", progressive filter relaxation for sparse CEFR levels, same-slot-from-similar-
 * word fallback for paradigms with too few forms — is task 10's job (`spec/tasks/10-distractors.md`),
 * which *depends on* this task and therefore cannot run first.
 *
 * The two exported functions below have exactly the signatures `spec/tasks/10-distractors.md`
 * §1/§2 specifies. Their BODIES here are a naive, deterministic placeholder: a seeded
 * uniform sample from a simple pool (same POS for vocabulary, any other literal form in the
 * same paradigm for morphology) — none of the quality rules above. Task 10 replaces ONLY
 * these two function bodies with the full algorithm; the signatures, this file's exports,
 * and `generate.ts`'s call sites must not change, so task 10 is a pure body swap.
 *
 * Task 09's acceptance does not check distractor *quality* (that's entirely task 10's
 * acceptance) — only that `generateExercise` is deterministic by seed and produces
 * well-formed exercises. See `distractors.test.ts` for what this stub is actually verified
 * to do: sample deterministically, respect `n`, never include the excluded/accepted forms.
 * ---------------------------------------------------------------------------------------
 */
import { getIndexStore } from '@/content/index-store.ts'
import { getFormsForSlot } from '@/content/paradigms.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { Direction } from './exercise.types.ts'

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic given the same numeric seed. Used only by this
// stub's naive sampling; task 10 is free to replace or drop it entirely when it rewrites
// the two exported function bodies below.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic seeded Fisher-Yates, truncated to the first `n` items — same `items`
 *  order + same `seed` always yields the same sample in the same order. */
function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  const pool = [...items]
  const rng = mulberry32(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  return pool.slice(0, Math.max(0, n))
}

/**
 * NAIVE STUB — see file header. Real algorithm: task 10 §1.
 * Pool here = every other word of `target.pos` in the content index; no rank/level bound,
 * no translation-intersection exclusion.
 */
export function pickVocabDistractors(
  target: WordIndexEntry,
  direction: Direction,
  n: number,
  seed: number,
): string[] {
  const pool = (getIndexStore().byPos.get(target.pos) ?? []).filter(
    (entry) => !(entry.lemma === target.lemma && entry.pos === target.pos),
  )
  const picked = seededSample(pool, n, seed)
  return picked.map((entry) => (direction === 'pl-ru' ? entry.primaryRu : entry.lemma))
}

/**
 * NAIVE STUB — see file header. Real algorithm: task 10 §2.
 * Pool here = every other distinct literal form already present in the same `paradigm`; no
 * same-slot-from-similar-word fallback when the paradigm itself is too small.
 */
export function pickFormDistractors(
  paradigm: Paradigm,
  targetSlot: Dimension,
  n: number,
  seed: number,
): string[] {
  const accepted = new Set(getFormsForSlot(paradigm, targetSlot))
  const pool = [...new Set(paradigm.forms.map((f) => f.form))].filter((form) => !accepted.has(form))
  return seededSample(pool, n, seed)
}
