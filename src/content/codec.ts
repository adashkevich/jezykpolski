/**
 * Codec dictionaries and encode/decode helpers for the content pipeline.
 *
 * Single source of truth shared by:
 *  - `scripts/build-content.ts` (produces `public/content/**`);
 *  - the future runtime content-access layer (task 04), which decodes what the build
 *    script encoded.
 *
 * Every dictionary maps a finite set of real string/number values observed in
 * `data/words.json` + `data/inflections.json` to small integer codes. Code `0` is
 * reserved, uniformly across every dictionary, to mean "no value" (the dimension does
 * not apply to this form) — e.g. a present-tense verb form has no `gender`.
 *
 * See `spec/tasks/02-content-pipeline.md` §2 for the exact value sets (verified against
 * the real data) and §6 for the ADJ gender aggregate handling.
 */

// ---------------------------------------------------------------------------
// Raw value dictionaries (order is the source of the numeric code, do not reorder
// existing entries without a content-version bump — it would change encoded output).
// ---------------------------------------------------------------------------

export const POS_VALUES = ['NOUN', 'VERB', 'ADJ', 'ADV'] as const
export type PosValue = (typeof POS_VALUES)[number]

export const LEVEL_VALUES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type LevelValue = (typeof LEVEL_VALUES)[number]

export const NUMBER_VALUES = ['singular', 'plural'] as const
export type NumberValue = (typeof NUMBER_VALUES)[number]

export const CASE_VALUES = [
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'instrumental',
  'locative',
  'vocative',
] as const
export type CaseValue = (typeof CASE_VALUES)[number]

/**
 * Union of every `gender` value observed across NOUN, VERB and ADJ forms (10 total).
 * NOUN uses 5 of them, VERB uses 5 (overlapping with NOUN), ADJ uses 9 (including the
 * 4 aggregates handled by {@link ADJ_GENDER_AGGREGATE_EXPANSION}). A single shared
 * dictionary keeps one numeric code space instead of three per-POS spaces.
 */
export const GENDER_VALUES = [
  'feminine',
  'masculine_personal',
  'masculine_inanimate',
  'masculine_animate',
  'neuter',
  'non_masculine_personal',
  'any',
  'masculine_animate_or_personal',
  'masculine_or_neuter',
  'masculine',
] as const
export type GenderValue = (typeof GENDER_VALUES)[number]

export const DEGREE_VALUES = ['positive', 'comparative', 'superlative'] as const
export type DegreeValue = (typeof DEGREE_VALUES)[number]

export const TENSE_VALUES = ['present', 'past', 'future'] as const
export type TenseValue = (typeof TENSE_VALUES)[number]

export const MOOD_VALUES = ['indicative', 'imperative', 'infinitive'] as const
export type MoodValue = (typeof MOOD_VALUES)[number]

export const ASPECT_VALUES = ['imperfective', 'perfective'] as const
export type AspectValue = (typeof ASPECT_VALUES)[number]

/** Person is stored as a number (1 | 2 | 3) in the source data, not a string. */
export const PERSON_VALUES = [1, 2, 3] as const
export type PersonValue = (typeof PERSON_VALUES)[number]

// ---------------------------------------------------------------------------
// Generic dictionary factory: value <-> 1-based numeric code, 0 = "no value".
// ---------------------------------------------------------------------------

export interface Dictionary<T> {
  readonly values: readonly T[]
  /** `undefined` (no value) encodes to `0`. Unknown values also encode to `0`. */
  codeOf(value: T | undefined): number
  /** `0` decodes to `undefined`. Out-of-range codes decode to `undefined`. */
  valueOf(code: number): T | undefined
}

function makeDictionary<T>(values: readonly T[]): Dictionary<T> {
  const codeByValue = new Map<T, number>(values.map((v, i) => [v, i + 1]))
  return {
    values,
    codeOf(value) {
      if (value === undefined) return 0
      return codeByValue.get(value) ?? 0
    },
    valueOf(code) {
      if (code <= 0 || code > values.length) return undefined
      return values[code - 1]
    },
  }
}

export const POS = makeDictionary(POS_VALUES)
export const LEVEL = makeDictionary(LEVEL_VALUES)
export const NUMBER = makeDictionary(NUMBER_VALUES)
export const CASE = makeDictionary(CASE_VALUES)
export const GENDER = makeDictionary(GENDER_VALUES)
export const DEGREE = makeDictionary(DEGREE_VALUES)
export const TENSE = makeDictionary(TENSE_VALUES)
export const MOOD = makeDictionary(MOOD_VALUES)
export const ASPECT = makeDictionary(ASPECT_VALUES)
export const PERSON = makeDictionary(PERSON_VALUES)

/** Everything `manifest.json`'s `codec` field needs, and what task 22 imports for labels. */
export const CODEC_DICTIONARIES = {
  pos: POS_VALUES,
  level: LEVEL_VALUES,
  number: NUMBER_VALUES,
  case: CASE_VALUES,
  gender: GENDER_VALUES,
  degree: DEGREE_VALUES,
  tense: TENSE_VALUES,
  mood: MOOD_VALUES,
  aspect: ASPECT_VALUES,
  person: PERSON_VALUES,
} as const

// ---------------------------------------------------------------------------
// ADJ gender aggregates (spec §2 "внимание"): 4 of the 9 ADJ gender values are
// aggregates of concrete genders, used where case syncretism merges several genders
// into one form (e.g. plural genitive/dative/instrumental/locative do not distinguish
// gender at all -> `any`). Declared once here; task 22 (adjective case tables) must
// reuse this, not invent a second breakdown.
// ---------------------------------------------------------------------------

export type AdjGenderAggregate =
  'any' | 'non_masculine_personal' | 'masculine_animate_or_personal' | 'masculine_or_neuter'

export const ADJ_GENDER_AGGREGATES: readonly AdjGenderAggregate[] = [
  'any',
  'non_masculine_personal',
  'masculine_animate_or_personal',
  'masculine_or_neuter',
]

/**
 * Aggregate gender value -> ordered list of the concrete genders it stands for.
 * Derived from the raw Wiktionary tags (`m1`=masculine_personal, `m2`=masculine_animate,
 * `m3`=masculine_inanimate, `f`=feminine, `n`=neuter):
 *  - `any`                           = m1.m2.m3.f.n (all five)
 *  - `non_masculine_personal`        = m2.m3.f.n     (all but masculine_personal)
 *  - `masculine_animate_or_personal` = m1.m2         (personal or animate masculine)
 *  - `masculine_or_neuter`           = m1.m2.m3.n    (all but feminine)
 *
 * Note: the 9th ADJ gender value, `masculine` (bare), is NOT an aggregate needing
 * expansion even though it also spans m1.m2.m3 — the nominative/vocative singular
 * masculine form never distinguishes animacy, so it is a genuine single display bucket,
 * not a merge of otherwise-distinct forms. Spec §2 explicitly lists only the four above.
 */
export const ADJ_GENDER_AGGREGATE_EXPANSION: Record<AdjGenderAggregate, GenderValue[]> = {
  any: ['masculine_personal', 'masculine_animate', 'masculine_inanimate', 'feminine', 'neuter'],
  non_masculine_personal: ['masculine_animate', 'masculine_inanimate', 'feminine', 'neuter'],
  masculine_animate_or_personal: ['masculine_personal', 'masculine_animate'],
  masculine_or_neuter: ['masculine_personal', 'masculine_animate', 'masculine_inanimate', 'neuter'],
}

export function isAdjGenderAggregate(value: GenderValue): value is AdjGenderAggregate {
  return (ADJ_GENDER_AGGREGATES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Form encoding: EncodedForm is a fixed-length tuple, 0 = "no value" for every
// numeric slot. Mirrors `spec/tasks/02-content-pipeline.md` §5 exactly.
// ---------------------------------------------------------------------------

export type EncodedForm = [
  form: string,
  number: number,
  caseCode: number,
  gender: number,
  degree: number,
  tense: number,
  person: number,
  mood: number,
  aspect: number,
  analytic: 0 | 1,
]

/** Shape of one inflected form as it appears (per-field) in `data/inflections.json`. */
export interface RawFormFields {
  form: string
  number?: NumberValue
  case?: CaseValue
  gender?: GenderValue
  degree?: DegreeValue
  tense?: TenseValue
  person?: PersonValue
  mood?: MoodValue
  aspect?: AspectValue
  analytic?: boolean
}

/** Decoded shape: same fields as {@link RawFormFields}, `analytic` always present. */
export interface DecodedForm {
  form: string
  number?: NumberValue
  case?: CaseValue
  gender?: GenderValue
  degree?: DegreeValue
  tense?: TenseValue
  person?: PersonValue
  mood?: MoodValue
  aspect?: AspectValue
  analytic: boolean
}

export function encodeForm(raw: RawFormFields): EncodedForm {
  return [
    raw.form,
    NUMBER.codeOf(raw.number),
    CASE.codeOf(raw.case),
    GENDER.codeOf(raw.gender),
    DEGREE.codeOf(raw.degree),
    TENSE.codeOf(raw.tense),
    PERSON.codeOf(raw.person),
    MOOD.codeOf(raw.mood),
    ASPECT.codeOf(raw.aspect),
    raw.analytic ? 1 : 0,
  ]
}

export function decodeForm(encoded: EncodedForm): DecodedForm {
  const [
    form,
    numberCode,
    caseCode,
    genderCode,
    degreeCode,
    tenseCode,
    personCode,
    moodCode,
    aspectCode,
    analytic,
  ] = encoded
  return {
    form,
    number: NUMBER.valueOf(numberCode),
    case: CASE.valueOf(caseCode),
    gender: GENDER.valueOf(genderCode),
    degree: DEGREE.valueOf(degreeCode),
    tense: TENSE.valueOf(tenseCode),
    person: PERSON.valueOf(personCode),
    mood: MOOD.valueOf(moodCode),
    aspect: ASPECT.valueOf(aspectCode),
    analytic: analytic === 1,
  }
}

// ---------------------------------------------------------------------------
// Deterministic shard hashing (FNV-1a, 32-bit).
//
// Stable across builds because it depends only on the string content of `wordId`,
// never on iteration/insertion order — adding or removing unrelated words never
// changes an existing word's shard number.
// ---------------------------------------------------------------------------

const FNV_OFFSET_BASIS_32 = 0x811c9dc5
const FNV_PRIME_32 = 0x01000193

export function fnv1aHash(input: string): number {
  let hash = FNV_OFFSET_BASIS_32
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME_32)
  }
  // Force unsigned 32-bit.
  return hash >>> 0
}

/** Deterministic shard index in `[0, shardCount)` for a given wordId. */
export function shardIndex(wordId: string, shardCount: number): number {
  if (shardCount <= 0) throw new Error(`shardCount must be positive, got ${shardCount}`)
  return fnv1aHash(wordId) % shardCount
}

export const SENSES_SHARD_COUNT = 16
export const PARADIGMS_SHARD_COUNT = 64

export function senseShardIndex(wordId: string): number {
  return shardIndex(wordId, SENSES_SHARD_COUNT)
}

export function paradigmShardIndex(wordId: string): number {
  return shardIndex(wordId, PARADIGMS_SHARD_COUNT)
}

/** Zero-padded 3-digit shard filename stem, e.g. `7` -> `"007"`. */
export function shardFileStem(shardNumber: number): string {
  return String(shardNumber).padStart(3, '0')
}

// ---------------------------------------------------------------------------
// Dominant gender for NOUN paradigms with more than one distinct `gender` across
// their forms (spec §6, 202 such nouns in the real data). Deterministic tie-break:
// the first gender in GENDER_VALUES order among the ones with the highest count wins,
// so re-running the build never flips the choice.
// ---------------------------------------------------------------------------

export function computeDominantGender(genders: readonly GenderValue[]): GenderValue | undefined {
  if (genders.length === 0) return undefined
  const counts = new Map<GenderValue, number>()
  for (const g of genders) {
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  let best: GenderValue | undefined
  let bestCount = -1
  for (const candidate of GENDER_VALUES) {
    const count = counts.get(candidate) ?? 0
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}
