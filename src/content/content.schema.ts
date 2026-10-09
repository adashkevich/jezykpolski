/**
 * Zod schemas for the content pipeline.
 *
 * Two jobs, per `spec/tasks/02-content-pipeline.md` §8:
 *  - validate the INPUT (`data/words.json`, `data/inflections.json`) at build time;
 *  - validate the OUTPUT artifacts (`public/content/**`) at build time, so a malformed
 *    encoder never silently ships.
 *
 * At runtime, only `ManifestSchema` is ever used (task 04) — validating all 195,487
 * forms with Zod on a mobile device is out of budget (architecture.md §4.6).
 *
 * `data/words.json` is schema_version 2 since task 46 (senses with ru/by/ua translations, a
 * Polish gloss and example, and one level per language profile); the v1 schemas were removed
 * by task 47, which switched the pipeline over.
 */
import { z } from 'zod'
import {
  ASPECT_VALUES,
  CASE_VALUES,
  DEGREE_VALUES,
  GENDER_VALUES,
  LEVEL_VALUES,
  MOOD_VALUES,
  NUMBER_VALUES,
  POS_VALUES,
  TENSE_VALUES,
} from './codec.ts'

// ---------------------------------------------------------------------------
// Input: data/words.json, schema_version 2 (spec/tasks/46, 47 §1)
// ---------------------------------------------------------------------------

export const RawFrequencySchema = z.object({
  rank: z.number().int().positive(),
  count: z.number().nonnegative(),
  per_million: z.number().nonnegative(),
  arf: z.number().nonnegative(),
  dispersion: z.number(),
})

/** One level per learner profile: Russian only (`ru`), + Belarusian (`by`), + Ukrainian (`ua`). */
export const LevelTripleSchema = z.object({
  ru: z.enum(LEVEL_VALUES),
  by: z.enum(LEVEL_VALUES),
  ua: z.enum(LEVEL_VALUES),
})

const ConfidenceSchema = z.number().min(0).max(1)

/** Editor-only (`data/words_parts/AGENTS.md`): never shipped to the runtime. */
export const ConfidenceTripleSchema = z.object({
  ru: ConfidenceSchema,
  by: ConfidenceSchema,
  ua: ConfidenceSchema,
})

const NonEmptyStringSchema = z.string().min(1)
const TranslationsSchema = z.array(NonEmptyStringSchema).min(1)

export const RawSenseV2Schema = z.object({
  /** `"<lemma>:<slug>"` — permanent, unique across the whole dictionary. */
  sense_id: NonEmptyStringSchema,
  translation_ru: TranslationsSchema,
  translation_by: TranslationsSchema,
  translation_ua: TranslationsSchema,
  gloss_pl: NonEmptyStringSchema,
  example_pl: NonEmptyStringSchema,
  introduced_at: LevelTripleSchema,
  level_confidence: ConfidenceTripleSchema,
  primary: z.boolean(),
  // Absent on some senses of the edited chunks.
  source: z.string().optional(),
  // The 3 senses of `dzięki` carry their own POS (INTJ / ADP / NOUN) — kept as-is, never
  // shipped to the runtime. Free-form on purpose: `ADP` is not a word-level POS.
  pos: z.string().optional(),
})

/** One word of the assembled dictionary (`data/words.json`). */
export const RawWordV2Schema = z.object({
  lemma: z.string().min(1),
  pos: z.enum(POS_VALUES),
  frequency: RawFrequencySchema,
  /** Earliest level over the word's senses, per profile. */
  introduced_at: LevelTripleSchema,
  /** Confidence of the sense that decided `introduced_at` (the lowest, on a tie). */
  level_confidence: ConfidenceTripleSchema,
  senses: z.array(RawSenseV2Schema).min(1),
  // `null` for the words that have no paradigm in inflections.json.
  morph_lemma: z.string().nullable(),
})

/**
 * Every `pos` the editor's chunks (`data/words_parts/output`) may carry: the codec's
 * `POS_VALUES` plus `DET`. `scripts/assemble-words.ts` validates the chunks BEFORE it merges the
 * one `DET` word (`niektóry|DET` into `niektóry|ADJ`, `data/words-fixups.json`), and refuses to
 * write a word whose `pos` is not a codec value into `data/words.json`.
 */
export const CHUNK_POS_VALUES = [...POS_VALUES, 'DET'] as const

/** One word as the editor's chunks carry it — {@link RawWordV2Schema} with a wider `pos`. */
export const RawChunkWordSchema = RawWordV2Schema.extend({ pos: z.enum(CHUNK_POS_VALUES) })

export const WordsJsonV2Schema = z.object({
  schema_version: z.literal(2),
  generated_at: z.string(),
  source: z.string(),
  counts: z.record(z.string(), z.number()),
  words: z.array(RawWordV2Schema),
})

export type LevelTriple = z.infer<typeof LevelTripleSchema>
export type ConfidenceTriple = z.infer<typeof ConfidenceTripleSchema>
export type RawSenseV2 = z.infer<typeof RawSenseV2Schema>
export type RawWordV2 = z.infer<typeof RawWordV2Schema>
export type RawChunkWord = z.infer<typeof RawChunkWordSchema>
export type WordsJsonV2 = z.infer<typeof WordsJsonV2Schema>

// ---------------------------------------------------------------------------
// Input: data/inflections.json
//
// Still keyed by the v1 `wordId`s: a word whose id changed in v2 finds its paradigm through
// `scripts/paradigm-aliases.ts` (task 47 §3).
// ---------------------------------------------------------------------------

export const RawInflectedFormSchema = z.object({
  form: z.string().min(1),
  number: z.enum(NUMBER_VALUES).optional(),
  case: z.enum(CASE_VALUES).optional(),
  gender: z.enum(GENDER_VALUES).optional(),
  degree: z.enum(DEGREE_VALUES).optional(),
  tense: z.enum(TENSE_VALUES).optional(),
  mood: z.enum(MOOD_VALUES).optional(),
  aspect: z.enum(ASPECT_VALUES).optional(),
  person: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  raw_tag: z.string(),
  analytic: z.boolean().optional(),
})

export const RawParadigmSchema = z.object({
  lemma: z.string().min(1),
  pos: z.enum(POS_VALUES),
  morph_lemma: z.string(),
  forms: z.array(RawInflectedFormSchema),
})

export const InflectionsJsonSchema = z.object({
  generated_at: z.string(),
  count: z.number().int().nonnegative(),
  paradigms: z.record(z.string(), RawParadigmSchema),
})

export type RawInflectedForm = z.infer<typeof RawInflectedFormSchema>
export type RawParadigm = z.infer<typeof RawParadigmSchema>
export type InflectionsJson = z.infer<typeof InflectionsJsonSchema>

// ---------------------------------------------------------------------------
// Output: public/content/index.json
// ---------------------------------------------------------------------------

/**
 * `[wordId, posCode, rank, levelRu, levelBy, levelUa, primaryRu, sensesShard, paradigmShard]`.
 * The three levels are `LEVEL` codes of the word's PRIMARY sense, one per language profile
 * (`LANG_PROFILES` order) — not the word-level `introduced_at`, which is the minimum over all
 * senses (task 47, «Зачем»).
 */
export const IndexRowSchema = z.tuple([
  z.string(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.string(),
  z.number().int(),
  z.number().int(),
])

export const IndexJsonSchema = z.array(IndexRowSchema)

export type IndexRow = z.infer<typeof IndexRowSchema>
export type IndexJson = z.infer<typeof IndexJsonSchema>

// ---------------------------------------------------------------------------
// Output: public/content/senses/NNN.json
// ---------------------------------------------------------------------------

/**
 * What the runtime needs synchronously (distractors, answer checking, the level gate): `id`,
 * Russian translations, `lv` = `[ru, by, ua]` `LEVEL` codes of this sense (`LANG_PROFILES`
 * order) and `primary`. The Belarusian/Ukrainian translations are display-only and live in
 * `sense-details/` — with them here the shards would be 568 KB gzip against the 450 KB budget
 * (task 47, «Журнал решений»).
 */
export const SenseEntrySchema = z.object({
  id: z.string().min(1),
  ru: z.array(z.string()).min(1),
  lv: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  primary: z.boolean(),
})

/** Keyed by `wordId`; the primary sense comes first, the rest in source order. */
export const SensesShardSchema = z.record(z.string(), z.array(SenseEntrySchema).min(1))

export type SenseEntry = z.infer<typeof SenseEntrySchema>
export type SensesShard = z.infer<typeof SensesShardSchema>

// ---------------------------------------------------------------------------
// Output: public/content/sense-details/NNN.json — lazy (word card, exercise feedback), never
// precached or prewarmed. Same sharding as `senses/` (`senseShardIndex(wordId)`), keyed by
// `sense_id`.
// ---------------------------------------------------------------------------

export const SenseDetailsEntrySchema = z.object({
  /** `gloss_pl` */
  gl: z.string().min(1),
  /** `example_pl` */
  ex: z.string().min(1),
  /** `translation_by` */
  by: z.array(z.string()).min(1),
  /** `translation_ua` */
  ua: z.array(z.string()).min(1),
})

export const SenseDetailsShardSchema = z.record(z.string(), SenseDetailsEntrySchema)

export type SenseDetailsEntry = z.infer<typeof SenseDetailsEntrySchema>
export type SenseDetailsShard = z.infer<typeof SenseDetailsShardSchema>

// ---------------------------------------------------------------------------
// Output: public/content/paradigms/NNN.json
// ---------------------------------------------------------------------------

/** `[form, number, case, gender, degree, tense, person, mood, aspect, analytic]` */
export const EncodedFormSchema = z.tuple([
  z.string(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.union([z.literal(0), z.literal(1)]),
])

export const ParadigmEntrySchema = z.object({
  forms: z.array(EncodedFormSchema).min(1),
  dominantGender: z.number().int().optional(),
})

export const ParadigmsShardSchema = z.record(z.string(), ParadigmEntrySchema)

export type ParadigmEntry = z.infer<typeof ParadigmEntrySchema>
export type ParadigmsShard = z.infer<typeof ParadigmsShardSchema>

// ---------------------------------------------------------------------------
// Output: public/content/manifest.json — the ONLY artifact validated at runtime.
// ---------------------------------------------------------------------------

export const ManifestCodecSchema = z.object({
  pos: z.array(z.string()),
  level: z.array(z.string()),
  number: z.array(z.string()),
  case: z.array(z.string()),
  gender: z.array(z.string()),
  degree: z.array(z.string()),
  tense: z.array(z.string()),
  mood: z.array(z.string()),
  aspect: z.array(z.string()),
  person: z.array(z.number()),
})

export const ManifestSchema = z.object({
  contentVersion: z.string().length(12),
  generatedAt: z.string(),
  counts: z.object({
    words: z.number().int().nonnegative(),
    paradigms: z.number().int().nonnegative(),
    forms: z.number().int().nonnegative(),
  }),
  shards: z.object({
    senses: z.number().int().positive(),
    senseDetails: z.number().int().positive(),
    paradigms: z.number().int().positive(),
  }),
  codec: ManifestCodecSchema,
})

export type Manifest = z.infer<typeof ManifestSchema>
