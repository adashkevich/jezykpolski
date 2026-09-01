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
// Input: data/words.json
// ---------------------------------------------------------------------------

export const RawFrequencySchema = z.object({
  rank: z.number().int().positive(),
  count: z.number().nonnegative(),
  per_million: z.number().nonnegative(),
  arf: z.number().nonnegative(),
  dispersion: z.number(),
})

export const RawSenseSchema = z.object({
  translation_ru: z.array(z.string()).min(1),
  // 834 senses carry an explicit `null` here rather than omitting the key.
  gloss_en: z.string().nullable().optional(),
  primary: z.boolean(),
  source: z.string(),
})

export const RawWordSchema = z.object({
  lemma: z.string().min(1),
  pos: z.enum(POS_VALUES),
  frequency: RawFrequencySchema,
  introduced_at: z.enum(LEVEL_VALUES),
  level_confidence: z.number(),
  senses: z.array(RawSenseSchema).min(1),
  // `null` for exactly the 14 words that have no paradigm in inflections.json (spec §6).
  morph_lemma: z.string().nullable(),
})

export const WordsJsonSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  source: z.string(),
  counts: z.record(z.string(), z.number()),
  words: z.array(RawWordSchema),
})

export type RawWord = z.infer<typeof RawWordSchema>
export type WordsJson = z.infer<typeof WordsJsonSchema>

// ---------------------------------------------------------------------------
// Input: data/inflections.json
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

/** `[lemma, posCode, rank, levelCode, primaryRu, sensesShard, paradigmShard]` */
export const IndexRowSchema = z.tuple([
  z.string(),
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

export const SenseEntrySchema = z.object({
  ru: z.array(z.string()).min(1),
  en: z.string().optional(),
  primary: z.boolean(),
})

export const SensesShardSchema = z.record(z.string(), z.array(SenseEntrySchema).min(1))

export type SenseEntry = z.infer<typeof SenseEntrySchema>
export type SensesShard = z.infer<typeof SensesShardSchema>

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
    paradigms: z.number().int().positive(),
  }),
  codec: ManifestCodecSchema,
})

export type Manifest = z.infer<typeof ManifestSchema>
