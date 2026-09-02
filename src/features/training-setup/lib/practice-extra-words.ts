/**
 * Candidate-word source for the 2 Practice-only "extra" exercise types (task 27,
 * `spec/tasks/27-context-and-error-analysis.md` §5, FR-56/FR-57 — "Найди лишний перевод" /
 * "Быстрая классификация части речи").
 *
 * Deliberately NOT `resolvePracticeCandidateWords` (the resolver `matching`'s own entry
 * point reuses, per that task's explicit instruction): that function is parameterized by
 * ONE `PracticeSection` (NOUN/VERB/ADJ only — `learning/session/session.types.ts`'s
 * `PracticeSection`), but `pos-classify` specifically needs a batch that spans every
 * `PosValue`, ADV included, or "classify the part of speech" would be a trivially easy
 * single-answer drill whenever the current Practice tab only has one POS loaded. This task's
 * own decision (recorded here, since the task text left the exact word source open for
 * these 2 types, unlike `matching`'s explicit "reuse resolvePracticeCandidateWords"
 * instruction): sample directly from the already-in-memory `content/index-store.ts`
 * frequency index — no content fetch needed at all (neither of these 2 exercise types reads
 * a paradigm), restricted to the top `FREQUENCY_CEILING` words so the batch stays at a
 * reasonable difficulty (an obscure C2 word's translations are far too easy to spot as "the
 * odd one" or its POS far too obscure to classify confidently).
 */
import { getIndexStore } from '@/content/index-store.ts'
import { encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'

/** Same rank ceiling `spec/app-design.md`'s frequency-filter presets already offer
 *  elsewhere in this app (`TrainingSetupScreen`'s own "Топ 2000" option) — frequent enough
 *  that translations/POS are unambiguous, without narrowing the pool so much that repeated
 *  batches feel identical. */
const FREQUENCY_CEILING = 2000

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

/** `n` distinct `WordId`s, seeded, drawn from the top `FREQUENCY_CEILING` words by rank
 *  across every part of speech. Fewer than `n` when the corpus itself is smaller (never
 *  padded/fabricated). */
export function pickPracticeExtraWordIds(n: number, seed: number): WordId[] {
  const pool = getIndexStore()
    .byRank.filter((entry) => entry.rank <= FREQUENCY_CEILING)
    .map((entry) => encodeWordId(entry.lemma, entry.pos))
  return seededSample(pool, n, seed)
}
