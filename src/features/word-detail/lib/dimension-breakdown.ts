/**
 * Per-dimension progress breakdown for `WordDetailPage`'s "Прогресс" section
 * (`spec/tasks/08-word-detail.md` §4, FR-47, `spec/architecture.md` §5.4's
 * `kobieta|NOUN` example: "Singular 88% / Plural 42%" alongside a per-case list).
 *
 * Pure function over `learning/**`'s own primitives — `aggregateByDimension` (task 03) does
 * all the actual grouping/averaging; this module only supplies the POS-specific grouping
 * keys `aggregate.ts` doesn't already export (`byCaseKey`/`byNumberKey`/`byTenseKey`/
 * `byGenderKey` cover case/number/tense/gender, but not "imperative mood" or "degree",
 * which `aggregate.ts` has no dedicated key for) and the canonical row order + bilingual
 * labels to render them with. No React, no Dexie — kept pure so it's testable without
 * rendering anything, same spirit as `learning/**` itself even though this file lives in
 * `features/word-detail/**` (it's UI-shaping, e.g. row grouping/titles, not domain logic).
 */
import {
  aggregateByDimension,
  byCaseKey,
  byGenderKey,
  byNumberKey,
  byTenseKey,
  type DimensionGroupKey,
} from '@/learning/progress/aggregate.ts'
import {
  CASE_DISPLAY_ORDER,
  CASE_LABELS,
  DEGREE_DISPLAY_ORDER,
  DEGREE_LABELS,
  expandNumberAbbrev,
  GENDER_DISPLAY_ORDER,
  GENDER_LABELS,
  NUMBER_LABELS,
  TENSE_DISPLAY_ORDER,
  TENSE_LABELS,
  type DimensionLabel,
  type NumberAbbrev,
} from '@/learning/skills/dimensions.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import type { PosValue } from '@/content/codec.ts'
import type { SkillRecord } from '@/types/progress.ts'

export interface BreakdownRow {
  readonly key: string
  readonly label: string
  /** 0..1 average maturity for this group (`aggregateByDimension`'s output — 0 for a group
   *  with no materialized skill yet, same "no record = 0" convention as everywhere else). */
  readonly value: number
}

export interface BreakdownGroup {
  readonly title: string
  readonly rows: readonly BreakdownRow[]
}

// ---------------------------------------------------------------------------
// Grouping keys `learning/progress/aggregate.ts` doesn't already export — narrow,
// single-purpose, mirroring that module's own `byCaseKey`/`byNumberKey` style exactly.
// ---------------------------------------------------------------------------

const byImperativeKey: DimensionGroupKey = (d) =>
  d.kind === 'verb' && d.dimension.startsWith('verb:imperative:') ? 'imperative' : undefined

const byAdjDegreeKey: DimensionGroupKey = (d) =>
  d.kind === 'adj' && d.dimension.startsWith('adj:degree:') ? d.dimension.split(':')[2] : undefined

const byAdvDegreeKey: DimensionGroupKey = (d) =>
  d.kind === 'adv' ? d.dimension.split(':')[2] : undefined

/** `byNumberKey` groups by the literal `sg`/`pl` abbreviation baked into the dimension
 *  string (`aggregate.ts`'s own `NounDimension`/`AdjDimension` shape), not the expanded
 *  `NumberValue` `NUMBER_LABELS` is keyed by — so the row order here is the abbreviation,
 *  and `expandNumberAbbrev` bridges to the label lookup. */
const NUMBER_ABBREV_ORDER: readonly NumberAbbrev[] = ['sg', 'pl']

function numberLabelOf(key: string): DimensionLabel | undefined {
  return NUMBER_LABELS[expandNumberAbbrev(key as NumberAbbrev)]
}

/** Polish past tense's actual gender split (verified against real data — see
 *  `content/paradigms.ts`'s `PAST_GENDERS_BY_NUMBER`, which this mirrors): bare
 *  `masculine`/`feminine`/`neuter` in singular, `masculine_personal`/
 *  `non_masculine_personal` in plural — NOT the 5-way ADJ declension breakdown. */
const VERB_PAST_GENDER_ORDER = [
  'masculine',
  'feminine',
  'neuter',
  'masculine_personal',
  'non_masculine_personal',
] as const

function rowsFrom(
  order: readonly string[],
  labelOf: (key: string) => DimensionLabel | undefined,
  values: ReadonlyMap<string, number>,
): BreakdownRow[] {
  const rows: BreakdownRow[] = []
  for (const key of order) {
    const value = values.get(key)
    if (value === undefined) continue
    const label = labelOf(key)
    rows.push({ key, label: label ? `${label.pl} (${label.ru})` : key, value })
  }
  return rows
}

/** Adapts one of `dimensions.ts`'s `*_LABELS` records (keyed by its own literal-union type)
 *  into the `(key: string) => DimensionLabel | undefined` shape `rowsFrom` wants — a plain
 *  index lookup, not a re-derivation of any label. */
function labelLookup(labels: Record<string, DimensionLabel>) {
  return (key: string): DimensionLabel | undefined => labels[key]
}

/**
 * Groups `descriptors`/`known` into the breakdown sections relevant to `pos`. Returns `[]`
 * for a word with no morphological descriptors at all (no paradigm loaded yet, or one of
 * the 14 paradigm-less words) — `ProgressSection.tsx` is what decides what to show instead
 * (the "expand Формы слова first" hint vs. simply nothing for a paradigm-less word).
 */
export function buildDimensionBreakdown(
  pos: PosValue,
  descriptors: readonly SkillDescriptor[],
  known: ReadonlyMap<SkillId, SkillRecord>,
): BreakdownGroup[] {
  const groups: BreakdownGroup[] = []

  if (pos === 'NOUN' || pos === 'ADJ') {
    const caseRows = rowsFrom(
      CASE_DISPLAY_ORDER,
      labelLookup(CASE_LABELS),
      aggregateByDimension(descriptors, known, byCaseKey),
    )
    if (caseRows.length > 0) groups.push({ title: 'По падежам', rows: caseRows })

    const numberRows = rowsFrom(
      NUMBER_ABBREV_ORDER,
      numberLabelOf,
      aggregateByDimension(descriptors, known, byNumberKey),
    )
    if (numberRows.length > 0) groups.push({ title: 'По числу', rows: numberRows })
  }

  if (pos === 'ADJ') {
    const genderRows = rowsFrom(
      GENDER_DISPLAY_ORDER,
      labelLookup(GENDER_LABELS),
      aggregateByDimension(descriptors, known, byGenderKey),
    )
    if (genderRows.length > 0) groups.push({ title: 'По родам', rows: genderRows })

    const degreeRows = rowsFrom(
      DEGREE_DISPLAY_ORDER,
      labelLookup(DEGREE_LABELS),
      aggregateByDimension(descriptors, known, byAdjDegreeKey),
    )
    if (degreeRows.length > 0) groups.push({ title: 'Степени сравнения', rows: degreeRows })
  }

  if (pos === 'VERB') {
    const byTense = aggregateByDimension(descriptors, known, byTenseKey)
    const tenseRows = rowsFrom(TENSE_DISPLAY_ORDER, labelLookup(TENSE_LABELS), byTense)
    const imperativeValue = aggregateByDimension(descriptors, known, byImperativeKey).get(
      'imperative',
    )
    const moodRows =
      imperativeValue === undefined
        ? tenseRows
        : [
            ...tenseRows,
            {
              key: 'imperative',
              label: 'Tryb rozkazujący (повелительное)',
              value: imperativeValue,
            },
          ]
    if (moodRows.length > 0) groups.push({ title: 'По временам и наклонению', rows: moodRows })

    const genderRows = rowsFrom(
      VERB_PAST_GENDER_ORDER,
      labelLookup(GENDER_LABELS),
      aggregateByDimension(descriptors, known, byGenderKey),
    )
    if (genderRows.length > 0) groups.push({ title: 'Прошедшее время по родам', rows: genderRows })
  }

  if (pos === 'ADV') {
    const degreeRows = rowsFrom(
      DEGREE_DISPLAY_ORDER,
      labelLookup(DEGREE_LABELS),
      aggregateByDimension(descriptors, known, byAdvDegreeKey),
    )
    if (degreeRows.length > 0) groups.push({ title: 'Степени сравнения', rows: degreeRows })
  }

  return groups
}
