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
import type { Sense } from '@/types/content.ts'
import { loadSensesShard } from './loader.ts'
import { getIndexStore } from './index-store.ts'

function requireEntry(wordId: WordId) {
  const entry = getIndexStore().byId.get(wordId)
  if (!entry) {
    throw new Error(`senses: unknown wordId "${wordId}"`)
  }
  return entry
}

/** Primary Russian translation, read straight from the already-loaded index — no shard
 *  fetch, no `await`. */
export function getPrimaryTranslation(wordId: WordId): string {
  return requireEntry(wordId).primaryRu
}

/** Every sense (meaning) of `wordId`, in the order the content pipeline emitted them
 *  (primary sense first — see `scripts/build-content.ts`). */
export async function getSenses(wordId: WordId): Promise<Sense[]> {
  const entry = requireEntry(wordId)
  const shard = await loadSensesShard(entry.sensesShard)
  return shard.get(wordId) ?? []
}

/** Every Russian translation across every sense, de-duplicated, primary sense's
 *  translations first — for answer-checking and distractor generation (task 09/10), which
 *  need the full accepted-answer set, not just the one shown in the list. */
export async function getAllTranslations(wordId: WordId): Promise<string[]> {
  const senses = await getSenses(wordId)
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
  return result
}
