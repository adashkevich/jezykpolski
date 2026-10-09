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
 * decoded sense view is declared here rather than as a `content/**`-local type. Decoding only
 * turns the `lv` level codes of one `public/content/senses/NNN.json` entry (`SenseEntry` in
 * `content.schema.ts`) into {@link ProfileLevels}.
 */
import type {
  DecodedForm,
  GenderValue,
  LangProfile,
  LevelValue,
  PosValue,
} from '@/content/codec.ts'

/** One level per language profile (task 47): knows Russian only / + Belarusian / + Ukrainian. */
export type ProfileLevels = Readonly<Record<LangProfile, LevelValue>>

/**
 * Decoded view of one `public/content/index.json` row (`IndexRow = [wordId, posCode, rank,
 * levelRu, levelBy, levelUa, primaryRu, sensesShard, paradigmShard]`).
 */
export interface WordIndexEntry {
  readonly lemma: string
  readonly pos: PosValue
  readonly rank: number
  /**
   * Level of the word's PRIMARY sense in the active language profile — what the level gate,
   * filters and `/stats` use. The loader decodes it as `levels.ru`; `content/index-store.ts`
   * builds the index with the active profile's column instead (task 51).
   */
  readonly level: LevelValue
  /** Level of the primary sense per profile (task 47) — not the minimum over all senses. */
  readonly levels: ProfileLevels
  /** First Russian translation of the primary sense (full sense list lives in the senses shard). */
  readonly primaryRu: string
  readonly sensesShard: number
  /** `-1` when the word has no paradigm (27 words of the v2 corpus, task 47 §3). */
  readonly paradigmShard: number
}

/** `sense_id` from `data/words.json` — `"<lemma>:<slug>"`, permanent and globally unique. */
export type SenseId = string

/**
 * Decoded view of one meaning of a word (one entry of `public/content/senses/NNN.json`'s
 * per-word array). Primary sense first, the rest in source order.
 */
export interface Sense {
  readonly id: SenseId
  /** Russian translation(s) for this sense; always at least one. */
  readonly ru: readonly string[]
  /** This sense's own level per profile. */
  readonly levels: ProfileLevels
  /** Whether this is the word's primary sense — the one being taught (task 49). */
  readonly primary: boolean
}

/**
 * Display-only part of a sense, from the lazy `public/content/sense-details/NNN.json` shard
 * (word card, exercise feedback — tasks 50/51). Never needed synchronously.
 */
export interface SenseDetails {
  /** Polish explanation of the sense (`gloss_pl`). */
  readonly gloss: string
  /** Polish usage example of this sense (`example_pl`). */
  readonly example: string
  /** Belarusian translation(s); always at least one. */
  readonly by: readonly string[]
  /** Ukrainian translation(s); always at least one. */
  readonly ua: readonly string[]
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
