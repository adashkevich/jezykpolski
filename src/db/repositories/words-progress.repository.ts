/**
 * `wordProgress` table access (`spec/tasks/05-persistence.md` §4).
 *
 * `wordProgress` is a denormalized cache, never a second source of truth
 * (architecture.md §5.5) — every row here is fully recomputable from `skills` plus the
 * content layer (task 04: `enumerateSkills` needs the word's full slot list — the
 * denominator — from `public/content/**`, not just whichever `SkillRecord`s happen to
 * exist — architecture.md §5.2's "знаменатель из контента, числитель из БД"). Both
 * `recomputeWordProgress` and `recomputeAll` therefore need the content index/paradigm
 * already loaded (i.e. called after `ContentProvider` has resolved), same precondition
 * `loader.ts#getParadigm` already has.
 */
import { db } from '../database.ts'
import type { PosValue } from '@/content/codec.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { getParadigm } from '@/content/paradigms.ts'
import { aggregateWord, deriveStatus } from '@/learning/progress/aggregate.ts'
import { enumerateSkills } from '@/learning/skills/enumerate.ts'
import { decodeWordId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord, WordProgressRecord } from '@/types/progress.ts'

export async function getWordProgress(wordId: WordId): Promise<WordProgressRecord | undefined> {
  return db.wordProgress.get(wordId)
}

export async function getAllWordProgress(): Promise<Map<WordId, WordProgressRecord>> {
  const rows = await db.wordProgress.toArray()
  return new Map(rows.map((row) => [row.wordId, row]))
}

/** Home screen's per-section counters (`spec/tasks/15-home-screen.md` §3/§4). */
export interface WordProgressSummary {
  /** `status === 'learning'`, all parts of speech combined. */
  learningTotal: number
  /** `status ∈ {'known', 'mastered'}` — "выучено" — all parts of speech combined. */
  learnedTotal: number
  /** Same "выучено" bucket, broken down by POS (missing key ≡ 0). */
  learnedByPos: Partial<Record<PosValue, number>>
}

/**
 * Home screen counters WITHOUT loading all 7998 `wordProgress` rows into memory
 * (`spec/tasks/15-home-screen.md` §3 "Производительность", acceptance point 8).
 *
 * Each status bucket is read via `.where('status').equals(...).primaryKeys()` — Dexie
 * answers that straight from the `status` index (an IndexedDB index entry is already
 * `[indexedValue, primaryKey]`), so this never deserializes a `WordProgressRecord` at all,
 * let alone the whole table. The POS breakdown then comes for free: `wordId` already
 * encodes its part of speech (`"<lemma>|<POS>"`, `skill-id.ts#decodeWordId`), so bucketing
 * by POS is a cheap in-memory `decodeWordId` over whichever rows matched `status` — never a
 * second query, and never a join against content. The POS *denominator* (words per
 * section) is a separate concern this function deliberately does NOT compute: it lives in
 * the already-loaded `getIndexStore().byPos` (task 04), a synchronous in-memory Map, not a
 * Dexie table — callers combine the two themselves.
 */
export async function getWordProgressSummary(): Promise<WordProgressSummary> {
  const [learningIds, knownIds, masteredIds] = await Promise.all([
    db.wordProgress.where('status').equals('learning').primaryKeys(),
    db.wordProgress.where('status').equals('known').primaryKeys(),
    db.wordProgress.where('status').equals('mastered').primaryKeys(),
  ])

  const learnedByPos: Partial<Record<PosValue, number>> = {}
  for (const id of [...knownIds, ...masteredIds] as WordId[]) {
    const { pos } = decodeWordId(id)
    learnedByPos[pos] = (learnedByPos[pos] ?? 0) + 1
  }

  return {
    learningTotal: learningIds.length,
    learnedTotal: knownIds.length + masteredIds.length,
    learnedByPos,
  }
}

/**
 * Builds the `WordProgressRecord` for `wordId` from a given set of `skills` rows + the
 * content-derived slot list, or `undefined` if the set is empty (mirrors the
 * lazy-materialization rule: "no record" already means `new`, so nothing is stored for it —
 * same sparsity principle as `skills` itself, architecture.md §5.2).
 *
 * Exported (not just used internally by `recomputeWordProgress`/`recomputeAll`) so a future
 * caller that needs the *next* `WordProgressRecord` after an in-flight change — e.g.
 * `answer.repository.ts#applyAnswer`'s caller (task 11), which must hand `applyAnswer` an
 * already-computed `nextWordProgress` because the write itself has to stay inside one
 * network-free Dexie transaction (see that file's header) — can pass a hypothetical
 * `skillsForWord` array (the real rows with one entry swapped for its post-answer version)
 * without duplicating this content-lookup + aggregation logic.
 */
export async function computeWordProgress(
  wordId: WordId,
  skillsForWord: readonly SkillRecord[],
): Promise<WordProgressRecord | undefined> {
  if (skillsForWord.length === 0) return undefined

  const entry = getIndexStore().byId.get(wordId)
  if (!entry) {
    throw new Error(`recomputeWordProgress: unknown wordId "${wordId}" (not in content index)`)
  }
  const paradigm = await getParadigm(wordId)
  const descriptors = enumerateSkills(entry, paradigm ?? undefined)
  const known = new Map<SkillId, SkillRecord>(skillsForWord.map((s) => [s.skillId, s]))
  const agg = aggregateWord(descriptors, known)

  let nextDue: number | undefined
  for (const skill of skillsForWord) {
    if (nextDue === undefined || skill.due < nextDue) nextDue = skill.due
  }

  return {
    wordId,
    status: deriveStatus(agg),
    vocabMaturity: agg.vocabMaturity,
    morphMaturity: agg.morphMaturity ?? 0,
    nextDue,
    updatedAt: Date.now(),
  }
}

/** Recomputes and persists (or, if the word now has zero skills, deletes) the
 *  `wordProgress` row for one word — called after `applyAnswer`/`resetWord` touch that
 *  word's `skills`. */
export async function recomputeWordProgress(wordId: WordId): Promise<void> {
  const skillsForWord = await db.skills.where('wordId').equals(wordId).toArray()
  const record = await computeWordProgress(wordId, skillsForWord)
  if (record === undefined) {
    await db.wordProgress.delete(wordId)
  } else {
    await db.wordProgress.put(record)
  }
}

/**
 * Full rebuild from `skills` — used after import/migration (task text §4). Recomputes one
 * row per word that has at least one `SkillRecord`, so the end state is byte-for-byte
 * identical to calling `recomputeWordProgress` on every such word individually (this
 * task's acceptance point 5) — no stale rows survive for a word whose last skill was since
 * deleted (e.g. via `resetWord`), because the whole table is cleared before reinserting.
 *
 * Deliberately NOT one long `db.transaction(...)` spanning the whole loop:
 * `computeWordProgress` awaits `getParadigm`, which can hit the network (`content/loader.ts`,
 * task 04) for a paradigm shard that hasn't been fetched yet. An IndexedDB transaction
 * auto-commits once its call stack returns to the event loop with no request pending, so
 * holding one open across a `fetch()` round trip is unsafe (a Dexie call issued after the
 * browser silently committed under it would throw). Instead: read + compute everything
 * (content fetches included) first with plain awaited calls outside any transaction, then
 * write the whole result set in one short, purely-Dexie `readwrite` transaction — that
 * final write is the step that actually needs to be atomic (a reader must never observe a
 * cleared-but-not-yet-refilled table).
 */
export async function recomputeAll(): Promise<void> {
  // Distinct wordIds via the `wordId` index — cheap, no full-table scan of `skills`.
  const wordIds = (await db.skills.orderBy('wordId').uniqueKeys()) as WordId[]

  const records: WordProgressRecord[] = []
  for (const wordId of wordIds) {
    const skillsForWord = await db.skills.where('wordId').equals(wordId).toArray()
    const record = await computeWordProgress(wordId, skillsForWord)
    if (record !== undefined) records.push(record)
  }

  await db.transaction('rw', db.wordProgress, async () => {
    await db.wordProgress.clear()
    await db.wordProgress.bulkPut(records)
  })
}
