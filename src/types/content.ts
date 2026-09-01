/**
 * Decoded runtime shapes for the content artifacts produced by `scripts/build-content.ts`
 * (task 02, `public/content/**`).
 *
 * `src/content/content.schema.ts` (task 02) defines the *wire* shapes (`IndexRow` tuples,
 * `ParadigmEntry` with `EncodedForm` tuples) as they sit in the JSON shards. Those are
 * compact but not pleasant to consume. The content-access layer (task 04,
 * `src/content/index-store.ts` + `src/content/paradigms.ts`) is expected to decode wire
 * rows into the shapes declared here.
 *
 * These types live in `src/types/**` rather than `src/content/**` so that the pure domain
 * layer (`src/learning/skills/enumerate.ts`, task 03) can depend on a stable decoded shape
 * without importing task 04's not-yet-built loader — `src/learning/**` may still import
 * `src/content/codec.ts` itself (plain dictionaries/decoders, no React/Dexie), just not the
 * loader/store modules that will eventually produce these values from `fetch`.
 */
import type { DecodedForm, GenderValue, LevelValue, PosValue } from '@/content/codec.ts'

/**
 * Decoded view of one `public/content/index.json` row
 * (`IndexRow = [lemma, posCode, rank, levelCode, primaryRu, sensesShard, paradigmShard]`).
 */
export interface WordIndexEntry {
  readonly lemma: string
  readonly pos: PosValue
  readonly rank: number
  readonly level: LevelValue
  /** First translation of the primary sense (full sense list lives in the senses shard). */
  readonly primaryRu: string
  readonly sensesShard: number
  /** `-1` when the word has no paradigm (14 words in the real corpus, see task 02 §6). */
  readonly paradigmShard: number
}

/**
 * Decoded view of one `public/content/paradigms/NNN.json` entry
 * (`ParadigmEntry`, with every `EncodedForm` run through `decodeForm`).
 */
export interface Paradigm {
  readonly forms: readonly DecodedForm[]
  /**
   * Set only for the ~202 NOUN paradigms whose forms carry more than one distinct `gender`
   * (task 02 §6) — the majority-gender pick for display in the word-detail header.
   */
  readonly dominantGender?: GenderValue
}
