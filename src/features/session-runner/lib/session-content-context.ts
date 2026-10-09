/**
 * Concrete `ContentContext` (`@/learning/exercises/exercise.types.ts`, task 09) implemented
 * over `src/content/**` (task 04) — the "thin adapter" that file's own header says a caller
 * must provide, and which no task before this one actually built (verified: nothing under
 * `src/content/**` exports a `ContentContext`; `generate.test.ts` only ever hand-rolls a
 * fake one). The session runner is the first real caller of `generateExercise`, so it is the
 * one that has to close this gap.
 *
 * `generateExercise` needs its `ContentContext` to be synchronous (own doc comment: an
 * `async` generator would race "shard still loading" against "user re-rendered the same
 * question"), but `getAllTranslations`/`getParadigm` are `async` in `content/senses.ts` /
 * `content/paradigms.ts` (they may need to fetch a shard the first time a word is touched).
 * `SessionContentCache.preload(wordId)` is the resolution `exercise.types.ts` itself
 * prescribes: await both once per word *before* that word's exercise is generated, cache the
 * results, then hand out a sync facade that only ever reads the cache.
 *
 * Task 50 (`spec/tasks/50-word-detail-senses-v2.md` §2) adds one more thing that rides along
 * with `preload`: the Polish example of the word's primary sense, for the exercise feedback.
 * It comes from the lazy `sense-details` shard and is NOT awaited — the question must never
 * wait for a display-only extra — so it is requested in the background and read with
 * {@link SessionContentCache.getPrimaryExample}, which simply answers `undefined` until (or
 * unless: offline, never cached) the shard has arrived.
 */
import { getAllTranslations, getPrimaryExample, getPrimaryTranslation } from '@/content/senses.ts'
import { getParadigm } from '@/content/paradigms.ts'
import { getIndexStore } from '@/content/index-store.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { ContentContext } from '@/learning/exercises/exercise.types.ts'
import type { Paradigm } from '@/types/content.ts'

/** Primary-sense examples, fetched in the background and read synchronously. */
class PrimaryExamples {
  /** Words already asked for — once each; a failed attempt is not retried (offline it would
   *  only fail again on every later `preload` of the same word). */
  private readonly requested = new Set<WordId>()
  private readonly loaded = new Map<WordId, string>()

  request(wordId: WordId): void {
    if (this.requested.has(wordId)) return
    this.requested.add(wordId)
    getPrimaryExample(wordId)
      .then((example) => {
        if (example) this.loaded.set(wordId, example)
      })
      .catch(() => {
        // Display-only: no example (details shard unavailable offline, unknown word) just
        // means a feedback line less — `preload` reports the failures that matter.
      })
  }

  get(wordId: WordId): string | undefined {
    return this.loaded.get(wordId)
  }
}

export class SessionContentCache {
  private readonly paradigms = new Map<WordId, Paradigm | null>()
  private readonly translations = new Map<WordId, string[]>()
  private readonly examples = new PrimaryExamples()

  /** Idempotent — safe to call more than once for the same `wordId` (e.g. a word that shows
   *  up both as a `'due'` skill and, later, requeued after a mistake). Resolves once the
   *  translations and the paradigm are in; the example is requested but never awaited. */
  async preload(wordId: WordId): Promise<void> {
    if (!this.paradigms.has(wordId) || !this.translations.has(wordId)) {
      const [paradigm, allTranslations] = await Promise.all([
        getParadigm(wordId),
        getAllTranslations(wordId),
      ])
      this.paradigms.set(wordId, paradigm)
      this.translations.set(wordId, allTranslations)
    }
    // Only now, so the shards the question needs are never queued behind the extra one.
    this.examples.request(wordId)
  }

  /** The Polish example of `wordId`'s primary sense; `undefined` while loading, on failure, or
   *  when there is none. Never throws, never fetches. */
  getPrimaryExample(wordId: WordId): string | undefined {
    return this.examples.get(wordId)
  }

  /** Synchronous facade — throws if `preload(wordId)` hasn't resolved yet, which would be a
   *  caller bug (the session runner always preloads a word before generating its exercise),
   *  not a normal "still loading" case. */
  toContentContext(): ContentContext {
    const requireTranslations = (wordId: WordId): string[] => {
      const cached = this.translations.get(wordId)
      if (!cached) {
        throw new Error(
          `SessionContentCache: "${wordId}" was never preloaded — call preload() before generateExercise().`,
        )
      }
      return cached
    }

    return {
      getWordEntry: (wordId) => {
        const entry = getIndexStore().byId.get(wordId)
        if (!entry) throw new Error(`SessionContentCache: unknown wordId "${wordId}"`)
        return entry
      },
      getPrimaryTranslation,
      getAllTranslations: requireTranslations,
      getParadigm: (wordId) => {
        if (!this.paradigms.has(wordId)) {
          throw new Error(
            `SessionContentCache: "${wordId}" was never preloaded — call preload() before generateExercise().`,
          )
        }
        return this.paradigms.get(wordId) ?? null
      },
    }
  }
}
