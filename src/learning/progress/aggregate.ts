/**
 * Skills -> percentages (`spec/tasks/03-domain-model.md` step 4, `spec/architecture.md` §5.4).
 *
 * Every function here is pure: given the *possible* skills for a word (from
 * `enumerateSkills`, the denominator) and whichever `SkillRecord`s actually exist in the DB
 * (the numerator — most slots have none, per the lazy-materialization rule in
 * architecture.md §5.2), compute maturity/status. Nothing here reads or writes storage.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { SkillId, WordId } from '../skills/skill-id.ts'
import type { SkillDescriptor } from '../skills/enumerate.ts'
import type { SkillRecord, WordStatus } from '@/types/progress.ts'

export type { WordStatus } from '@/types/progress.ts'

/**
 * Days of FSRS `stability` treated as "fully mature" (architecture.md §5.4). A stored
 * constant, not a number scattered through call sites, per the task's explicit instruction.
 */
export const TARGET_STABILITY_DAYS = 60

/** `vocabMaturity` at/above this crosses `learning` -> `known` (architecture.md §5.4). */
export const KNOWN_THRESHOLD = 0.35

/** Maturity at/above this (for both vocab and, if present, morphology) means `mastered`. */
export const MASTERED_THRESHOLD = 0.9

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/**
 * `maturity = clamp(stability / TARGET_STABILITY_DAYS, 0, 1)` (architecture.md §5.4).
 * `undefined` (no `SkillRecord` yet — the lazily-materialized default) maturity is `0`.
 */
export function skillMaturity(skill: SkillRecord | undefined): number {
  if (skill === undefined) return 0
  return clamp(skill.stability / TARGET_STABILITY_DAYS, 0, 1)
}

export interface WordAggregate {
  readonly wordId: WordId
  /** 0..1, average maturity over the `vocab:pl-ru` / `vocab:ru-pl` skills. */
  readonly vocabMaturity: number
  /**
   * 0..1, average maturity over every non-vocab skill. `undefined` — not `0` — when the
   * word has no morphological skills at all (one of the 14 words with no paradigm): there
   * is nothing to be "0% done" on, and `deriveStatus` treats the two differently (see below).
   */
  readonly morphMaturity: number | undefined
  /** 0..1, average maturity over every descriptor (vocab + morphology pooled together). */
  readonly overallMaturity: number
  /** How many of `all`'s skills have a matching `SkillRecord` — `0` means a brand-new word. */
  readonly recordedSkillCount: number
  readonly totalSkillCount: number
}

/** `agg` returns all-zero, `recordedSkillCount: 0` for a word with no `SkillRecord` at all —
 *  `skillMaturity(undefined)` is `0` for every descriptor, by construction above. */
export function aggregateWord(
  all: readonly SkillDescriptor[],
  known: ReadonlyMap<SkillId, SkillRecord>,
): WordAggregate {
  if (all.length === 0) {
    throw new Error(
      'aggregateWord: empty descriptor list (enumerateSkills always returns at least 2 vocab skills)',
    )
  }

  const wordId = all[0]!.wordId
  const vocabDescriptors = all.filter((d) => d.kind === 'vocab')
  const morphDescriptors = all.filter((d) => d.kind !== 'vocab')

  const maturityOf = (d: SkillDescriptor): number => skillMaturity(known.get(d.skillId))

  const vocabMaturity = average(vocabDescriptors.map(maturityOf))
  const morphMaturity =
    morphDescriptors.length === 0 ? undefined : average(morphDescriptors.map(maturityOf))
  const overallMaturity = average(all.map(maturityOf))
  const recordedSkillCount = all.filter((d) => known.has(d.skillId)).length

  return {
    wordId,
    vocabMaturity,
    morphMaturity,
    overallMaturity,
    recordedSkillCount,
    totalSkillCount: all.length,
  }
}

/**
 * Status thresholds from architecture.md §5.4, applied in this exact order:
 *
 * ```text
 * new       no SkillRecord at all for this word
 * learning  has records, but vocabMaturity < KNOWN_THRESHOLD
 * known     vocabMaturity >= KNOWN_THRESHOLD
 * mastered  vocabMaturity >= MASTERED_THRESHOLD AND
 *           (word has no morphology OR morphMaturity >= MASTERED_THRESHOLD)
 * ```
 */
export function deriveStatus(agg: WordAggregate): WordStatus {
  if (agg.recordedSkillCount === 0) return 'new'
  if (agg.vocabMaturity < KNOWN_THRESHOLD) return 'learning'

  const morphologyClearsBar =
    agg.morphMaturity === undefined || agg.morphMaturity >= MASTERED_THRESHOLD
  if (agg.vocabMaturity >= MASTERED_THRESHOLD && morphologyClearsBar) return 'mastered'

  return 'known'
}

// ---------------------------------------------------------------------------
// aggregateByDimension — breakdown by an arbitrary facet of the dimension (case, number,
// tense, gender, ...). Architecture.md §5.4's example breaks morphology down by number
// (Singular 88% / Plural 42%) and the stats screen (app-design.md §26) breaks it down by
// case; both are instances of "group skills by some key, average the maturity per group".
// ---------------------------------------------------------------------------

export type DimensionGroupKey = (descriptor: SkillDescriptor) => string | undefined

/** Groups `all` by `keyOf` (descriptors where `keyOf` returns `undefined` are excluded from
 *  every group) and averages `skillMaturity` within each group. */
export function aggregateByDimension(
  all: readonly SkillDescriptor[],
  known: ReadonlyMap<SkillId, SkillRecord>,
  keyOf: DimensionGroupKey,
): Map<string, number> {
  const bucketed = new Map<string, number[]>()
  for (const d of all) {
    const key = keyOf(d)
    if (key === undefined) continue
    const maturities = bucketed.get(key)
    const maturity = skillMaturity(known.get(d.skillId))
    if (maturities === undefined) {
      bucketed.set(key, [maturity])
    } else {
      maturities.push(maturity)
    }
  }

  const result = new Map<string, number>()
  for (const [key, maturities] of bucketed) result.set(key, average(maturities))
  return result
}

/** `dimension.split(':')` — every dimension-parsing key extractor below builds on this. */
function dimensionParts(descriptor: SkillDescriptor): readonly string[] {
  return descriptor.dimension.split(':')
}

/** Case, for NOUN and case-declined ADJ skills (not `adj:degree:*`, which has no case). */
export const byCaseKey: DimensionGroupKey = (d) => {
  const parts = dimensionParts(d)
  if (d.kind === 'noun') return parts[2]
  if (d.kind === 'adj' && parts[1] !== 'degree') return parts[3]
  return undefined
}

/** Grammatical number, for NOUN, VERB and case-declined ADJ skills. Position 3 is uniform
 *  across every VERB dimension shape (`present/future`, `past`, `imperative` all put
 *  number at index 3 — verified against the templates in `learning/skills/dimensions.ts`). */
export const byNumberKey: DimensionGroupKey = (d) => {
  const parts = dimensionParts(d)
  if (d.kind === 'noun') return parts[1]
  if (d.kind === 'adj') return parts[1] === 'degree' ? undefined : parts[1]
  if (d.kind === 'verb') return parts[3]
  return undefined
}

/** Tense, for indicative VERB skills (`present`/`future`/`past`; `imperative` has no tense). */
export const byTenseKey: DimensionGroupKey = (d) => {
  if (d.kind !== 'verb') return undefined
  const parts = dimensionParts(d)
  const slot = parts[1]
  return slot === 'imperative' ? undefined : slot
}

/** Gender, for VERB past-tense and case-declined ADJ skills. */
export const byGenderKey: DimensionGroupKey = (d) => {
  const parts = dimensionParts(d)
  if (d.kind === 'adj' && parts[1] !== 'degree') return parts[2]
  if (d.kind === 'verb' && parts[1] === 'past') return parts[4]
  return undefined
}
