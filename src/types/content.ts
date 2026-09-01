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
 *
 * `Sense` was added by task 04 (`src/content/senses.ts`): task 03 only defined
 * `WordIndexEntry`/`Paradigm`, but `spec/architecture.md` §7.1's future `Exercise` union
 * (task 09+) is expected to reference decoded `Paradigm`/`Sense` shapes side by side, so the
 * decoded sense view is declared here rather than as a `content/**`-local type. Decoding is
 * trivial (no numeric codec involved, unlike `Paradigm`) — it just types the JSON shape of
 * one `public/content/senses/NNN.json` entry (`SenseEntry` in `content.schema.ts`).
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
 * Decoded view of one meaning of a word (one entry of `public/content/senses/NNN.json`'s
 * per-word array).
 */
export interface Sense {
  /** Russian translation(s) for this sense; always at least one. */
  readonly ru: readonly string[]
  /** English-language gloss, when the source dictionary provided one. */
  readonly en?: string
  /** Whether this is the word's primary/most common sense. */
  readonly primary: boolean
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
