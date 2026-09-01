/**
 * Distractor selection for `choice` / `form-choice` exercises
 * (`spec/architecture.md` §7.4, `spec/app-design.md` §19, `spec/tasks/10-distractors.md`).
 *
 * ---------------------------------------------------------------------------------------
 * SYNC-VS-ASYNC RESOLUTION (decision log): `pickVocabDistractors`'s signature is
 * synchronous (`spec/tasks/10-distractors.md` §1 — task 09's `generate.ts` calls it as a
 * plain function, no `await`), but FR-92's translation-overlap exclusion needs each
 * candidate's *full* translation set, which normally lives behind an async senses-shard
 * fetch (`content/senses.ts`'s `getAllTranslations`). This module resolves the tension the
 * way the task text explicitly sanctions ("либо через уже загруженный в память кэш из
 * content/loader.ts"): `content/loader.ts` now exposes `peekSensesShard(n)` /
 * `peekParadigmShard(n)`, synchronous reads of shards that have *already* resolved (e.g.
 * because the user visited that word's detail page, or a caller warmed the cache via
 * `getAllTranslations`/`getParadigm` before generating this exercise — exactly the pattern
 * `exercise.types.ts`'s `ContentContext` doc comment already describes for the *target*
 * word). When a candidate's shard hasn't resolved yet, translation-overlap exclusion falls
 * back to the single translation already inlined in the index (`WordIndexEntry.primaryRu`)
 * — an under-approximation of the full sense set, but never a blocking fetch and never a
 * throw. In production this still correctly separates `znać`/`wiedzieć`: both share the
 * primaryRu "знать" even with zero shards warmed. Same idea for `pickFormDistractors`'s
 * same-slot-from-similar-word fallback: it reads whatever paradigm shards already happen to
 * be resolved via `peekParadigmShard`, and simply yields fewer than `n` distractors if none
 * are (callers already tolerate that — see `generate.ts`'s `buildFormChoice`, which
 * defensively re-filters against `accepted` regardless).
 * ---------------------------------------------------------------------------------------
 */
import { LEVEL_VALUES, type PosValue } from '@/content/codec.ts'
import { peekParadigmShard, peekSensesShard } from '@/content/loader.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { getFormsForSlot } from '@/content/paradigms.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { Paradigm, Sense, WordIndexEntry } from '@/types/content.ts'
import type { Direction } from './exercise.types.ts'

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic given the same numeric seed
// (task 10 §3: "Seed = хэш от skillId + reps... один и тот же вопрос при ре-рендере даёт
// те же варианты").
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

// ---------------------------------------------------------------------------
// pickVocabDistractors — architecture.md §7.4 / task 10 §1 steps 1-6.
// ---------------------------------------------------------------------------

/** De-duplicated Russian translations across every sense, primary sense first — the
 *  synchronous, best-effort mirror of `content/senses.ts`'s `getAllTranslations` described
 *  in this file's header. Falls back to `primaryRu` alone when the word's senses shard
 *  hasn't resolved in memory yet. */
function resolveTranslations(entry: WordIndexEntry): readonly string[] {
  const shard = peekSensesShard(entry.sensesShard)
  const senses: readonly Sense[] | undefined = shard?.get(encodeWordId(entry.lemma, entry.pos))
  if (senses && senses.length > 0) {
    const seen = new Set<string>()
    const result: string[] = []
    for (const sense of senses) {
      for (const translation of sense.ru) {
        if (!seen.has(translation)) {
          seen.add(translation)
          result.push(translation)
        }
      }
    }
    if (result.length > 0) return result
  }
  return [entry.primaryRu]
}

const LEVEL_INDEX = new Map(LEVEL_VALUES.map((level, index) => [level, index]))

/** Step 5's rank-window relaxation ladder — tried in order after the level filter has
 *  already been dropped and the pool is still short of `n`. See `pickVocabDistractors`'s
 *  rationale comment at its call site. */
const RANK_RELAXATION_MULTIPLIERS = [9, 27] as const

/** Step 2: "фильтр по частоте: rank в диапазоне [rank/3, rank*3]" — `multiplier` defaults to
 *  the spec's own ×3, but step 5's rank relaxation reuses this with a wider multiplier
 *  instead of dropping the rank bound in one jump (see `RANK_RELAXATION_MULTIPLIERS`). */
function withinRankWindow(candidate: WordIndexEntry, target: WordIndexEntry, multiplier = 3): boolean {
  return candidate.rank >= target.rank / multiplier && candidate.rank <= target.rank * multiplier
}

/** Step 3: "фильтр по уровню: ±1 ступень CEFR". */
function withinLevelWindow(candidate: WordIndexEntry, target: WordIndexEntry): boolean {
  const candidateIndex = LEVEL_INDEX.get(candidate.level) ?? 0
  const targetIndex = LEVEL_INDEX.get(target.level) ?? 0
  return Math.abs(candidateIndex - targetIndex) <= 1
}

/** Step 4: "ИСКЛЮЧИТЬ кандидатов, у которых пересекаются переводы с целевым" — checked
 *  against the *full* translation set (§7.4's explicit warning: not just the primary one),
 *  best-effort per this file's header. */
function excludeTranslationOverlap(
  pool: readonly WordIndexEntry[],
  targetTranslations: ReadonlySet<string>,
): WordIndexEntry[] {
  return pool.filter((candidate) => {
    const candidateTranslations = resolveTranslations(candidate)
    return !candidateTranslations.some((t) => targetTranslations.has(t))
  })
}

function displayText(entry: WordIndexEntry, direction: Direction): string {
  return direction === 'pl-ru' ? entry.primaryRu : entry.lemma
}

/** De-dupes candidates by what they'd actually display, so two different lemmas that
 *  happen to share a rendered translation (e.g. two synonyms neither of which was caught by
 *  the translation-overlap check because their *shards* never resolved) never produce two
 *  visually-identical options. */
function dedupeByDisplay(pool: readonly WordIndexEntry[], direction: Direction): WordIndexEntry[] {
  const seen = new Set<string>()
  const result: WordIndexEntry[] = []
  for (const entry of pool) {
    const text = displayText(entry, direction)
    if (!seen.has(text)) {
      seen.add(text)
      result.push(entry)
    }
  }
  return result
}

/**
 * `spec/architecture.md` §7.4 / `spec/tasks/10-distractors.md` §1:
 * ```text
 * 1. пул = слова той же части речи
 * 2. фильтр по частоте: rank в диапазоне [rank/3, rank*3]
 * 3. фильтр по уровню: ±1 ступень CEFR
 * 4. ИСКЛЮЧИТЬ кандидатов, у которых пересекаются переводы с целевым
 * 5. если кандидатов < n — последовательно ослаблять шаги 3, затем 2
 * 6. выбрать n детерминированно по seed
 * ```
 */
export function pickVocabDistractors(
  target: WordIndexEntry,
  direction: Direction,
  n: number,
  seed: number,
): string[] {
  // Step 1.
  const fullPool = (getIndexStore().byPos.get(target.pos) ?? []).filter(
    (entry) => !(entry.lemma === target.lemma && entry.pos === target.pos),
  )
  const targetTranslations = new Set(resolveTranslations(target))

  // Steps 2 + 3.
  const rankFiltered = fullPool.filter((candidate) => withinRankWindow(candidate, target))
  const rankAndLevelFiltered = rankFiltered.filter((candidate) => withinLevelWindow(candidate, target))

  // Step 4, at full strictness.
  let candidates = excludeTranslationOverlap(rankAndLevelFiltered, targetTranslations)

  // Step 5: relax the level filter (step 3) first...
  if (candidates.length < n) {
    candidates = excludeTranslationOverlap(rankFiltered, targetTranslations)
  }
  // ...then widen the rank window (step 2) progressively — ×9, then ×27 — rather than
  // dropping the rank bound in a single jump. A very high-frequency word (e.g. `mieć`,
  // rank 5) can have almost no *same-rank* neighbours at all even though plenty of same-level
  // words exist a bit further out (verified against the real corpus: only `móc` sits inside
  // `mieć`'s literal ×3 window, but 6 more real A1/A2 verbs appear by ×9) — widening
  // gradually keeps distractors as close in frequency as the real neighbourhood allows,
  // instead of jumping straight to "any same-POS word whatsoever".
  for (const multiplier of RANK_RELAXATION_MULTIPLIERS) {
    if (candidates.length >= n) break
    const widerRankFiltered = fullPool.filter((candidate) => withinRankWindow(candidate, target, multiplier))
    candidates = excludeTranslationOverlap(widerRankFiltered, targetTranslations)
  }
  // Last resort: same POS, no rank bound at all (task text, "Шаг 5 нужен для редких слов" —
  // mainly C1/C2 words or a POS with very few members overall).
  if (candidates.length < n) {
    candidates = excludeTranslationOverlap(fullPool, targetTranslations)
  }

  const deduped = dedupeByDisplay(candidates, direction)

  // Step 6.
  const picked = seededSample(deduped, n, seed)
  return picked.map((entry) => displayText(entry, direction))
}

// ---------------------------------------------------------------------------
// pickFormDistractors — architecture.md §7.4 / task 10 §2.
// ---------------------------------------------------------------------------

/** Which POS namespace a `Dimension` string belongs to (`learning/skills/dimensions.ts`'s
 *  `noun:*` / `verb:*` / `adj:*` / `adv:*` templates) — needed to find "похожих слов той же
 *  части речи" for the same-slot fallback, since `Paradigm` itself carries no POS/lemma. */
function posFromDimension(dimension: Dimension): PosValue | null {
  const prefix = dimension.split(':')[0]
  switch (prefix) {
    case 'noun':
      return 'NOUN'
    case 'verb':
      return 'VERB'
    case 'adj':
      return 'ADJ'
    case 'adv':
      return 'ADV'
    default:
      return null
  }
}

/** Fallback source for task 10 §2's last rule: "Если в парадигме не набирается n различных
 *  форм — добить формами того же слота из парадигм похожих слов той же части речи." Reads
 *  only paradigm shards already resolved in memory (`peekParadigmShard` — see this file's
 *  header); yields nothing extra for a POS whose neighbouring paradigms haven't been
 *  fetched yet, which is a graceful degradation, not an error. */
function collectSameSlotFormsFromSimilarWords(
  pos: PosValue,
  targetSlot: Dimension,
  exclude: ReadonlySet<string>,
): string[] {
  const entries = getIndexStore().byPos.get(pos) ?? []
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of entries) {
    if (entry.paradigmShard === -1) continue
    const shard = peekParadigmShard(entry.paradigmShard)
    if (!shard) continue
    const otherParadigm = shard.get(encodeWordId(entry.lemma, entry.pos))
    if (!otherParadigm) continue
    for (const form of getFormsForSlot(otherParadigm, targetSlot)) {
      if (!exclude.has(form) && !seen.has(form)) {
        seen.add(form)
        result.push(form)
      }
    }
  }
  return result
}

/**
 * `spec/architecture.md` §7.4 / `spec/tasks/10-distractors.md` §2: distractors are other
 * forms of the *same paradigm* (other cases/persons of the same word) — "содержательная
 * сложность" is choosing between `kobiety / kobiecie / kobietą`, not between unrelated
 * words. Forms equal to the target slot's own accepted answer(s) are always excluded (one
 * literal form can serve several slots, e.g. `aborcji` = sg.gen/sg.dat/sg.loc/(alt.)pl.gen —
 * excluding by *text*, not by slot, is what correctly drops every occurrence). When the
 * paradigm itself doesn't yield `n` distinct forms, the same slot is pulled from other
 * words' paradigms of the same part of speech (best-effort, see
 * `collectSameSlotFormsFromSimilarWords`).
 */
export function pickFormDistractors(
  paradigm: Paradigm,
  targetSlot: Dimension,
  n: number,
  seed: number,
): string[] {
  const accepted = new Set(getFormsForSlot(paradigm, targetSlot))

  const sameParadigmPool = [...new Set(paradigm.forms.map((f) => f.form))].filter(
    (form) => !accepted.has(form),
  )

  let pool = sameParadigmPool
  if (pool.length < n) {
    const pos = posFromDimension(targetSlot)
    if (pos) {
      const fallbackForms = collectSameSlotFormsFromSimilarWords(pos, targetSlot, accepted)
      const merged = new Set(pool)
      for (const form of fallbackForms) merged.add(form)
      pool = [...merged]
    }
  }

  return seededSample(pool, n, seed)
}
