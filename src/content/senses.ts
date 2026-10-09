/**
 * Sense (translation) access (`spec/tasks/04-content-access-layer.md` §5).
 *
 * `getPrimaryTranslation` is synchronous and never loads a shard — the primary Russian
 * translation is already inlined in `index.json` (`WordIndexEntry.primaryRu`), specifically
 * so the words list can render translations without fetching all 16 senses shards up front.
 * `getSenses` / `getAllTranslations` do need the word's senses shard (for the *other*
 * senses), fetched through `loader.ts`'s deduplicated per-shard cache.
 */
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Sense, SenseDetails, SenseId } from '@/types/content.ts'
import { loadSenseDetailsShard, loadSensesShard } from './loader.ts'
import { getIndexStore } from './index-store.ts'

function requireEntry(wordId: WordId) {
  const entry = getIndexStore().byId.get(wordId)
  if (!entry) {
    throw new Error(`senses: unknown wordId "${wordId}"`)
  }
  return entry
}

/** Primary Russian translation — the first translation of the word's primary sense
 *  (task 47) — read straight from the already-loaded index, no shard fetch, no `await`. */
export function getPrimaryTranslation(wordId: WordId): string {
  return requireEntry(wordId).primaryRu
}

/**
 * `senses` with the primary sense (`Sense.primary`) first, the others after it in their
 * original order (task 49 §2). The content pipeline already emits the primary sense first
 * (`scripts/build-content.ts`), but nothing downstream should depend on that position: the
 * flag is the source of truth. A list with no flagged sense comes back in its own order.
 */
export function primaryFirst(senses: readonly Sense[]): Sense[] {
  const primary = senses.find((sense) => sense.primary)
  return primary === undefined ? [...senses] : [primary, ...senses.filter((s) => s !== primary)]
}

/** Every Russian translation across `senses`, de-duplicated, the primary sense's first. Shared
 *  by {@link getAllTranslations} and the synchronous mirror in `learning/exercises/
 *  distractors.ts`, so the two can never disagree about what "all translations" means. */
export function translationsPrimaryFirst(senses: readonly Sense[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const sense of primaryFirst(senses)) {
    for (const translation of sense.ru) {
      if (!seen.has(translation)) {
        seen.add(translation)
        result.push(translation)
      }
    }
  }
  return result
}

/** Every sense (meaning) of `wordId`, the primary one first (by its `primary` flag — see
 *  {@link primaryFirst}), the rest in source order (`scripts/build-content.ts`). */
export async function getSenses(wordId: WordId): Promise<Sense[]> {
  const entry = requireEntry(wordId)
  const shard = await loadSensesShard(entry.sensesShard)
  return primaryFirst(shard.get(wordId) ?? [])
}

/** Every Russian translation across every sense, de-duplicated, primary sense's
 *  translations first — for answer-checking and distractor generation (task 09/10), which
 *  need the full accepted-answer set, not just the one shown in the list. Deliberately ALL
 *  senses, though only the primary one is taught (task 49 §2): naming a correct but non-primary
 *  meaning of the word is not a mistake. */
export async function getAllTranslations(wordId: WordId): Promise<string[]> {
  return translationsPrimaryFirst(await getSenses(wordId))
}

/**
 * Display-only details (Polish gloss and example, Belarusian/Ukrainian translations) of every
 * sense of `wordId`, keyed by sense id — from the lazy `sense-details/` shard (task 47 §4).
 * Rejects when that shard cannot be fetched (e.g. offline and never cached before). A sense
 * missing from the shard is simply absent from the map.
 */
export async function getSenseDetails(wordId: WordId): Promise<Map<SenseId, SenseDetails>> {
  const entry = requireEntry(wordId)
  const [senses, shard] = await Promise.all([
    getSenses(wordId),
    loadSenseDetailsShard(entry.sensesShard),
  ])
  const result = new Map<SenseId, SenseDetails>()
  for (const sense of senses) {
    const details = shard.get(sense.id)
    if (details) result.set(sense.id, details)
  }
  return result
}
