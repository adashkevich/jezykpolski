/**
 * The skill dimension namespace (`spec/tasks/03-domain-model.md` step 2,
 * `spec/architecture.md` §5.1).
 *
 * A `Dimension` is the part of a `SkillId` after `"::"` — it names *which* fact about a
 * word is being tested (which case, which tense/person/number, which degree, ...).
 * `learning/skills/enumerate.ts` is the only place that constructs these strings from real
 * paradigm data; this module only declares the shape and the display metadata (order,
 * bilingual labels) that `learning/**`'s consumers (the UI, later tasks) read instead of
 * re-deriving it.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type {
  AdjGenderAggregate,
  CaseValue,
  DegreeValue,
  GenderValue,
  NumberValue,
  PersonValue,
  TenseValue,
} from '@/content/codec.ts'
import { CASE_VALUES, DEGREE_VALUES, PERSON_VALUES, TENSE_VALUES } from '@/content/codec.ts'

// ---------------------------------------------------------------------------
// Number abbreviation — every dimension template uses "sg"/"pl", not the decoded
// "singular"/"plural" strings (architecture.md §5.1 examples: `noun:sg:genitive`).
// ---------------------------------------------------------------------------

export type NumberAbbrev = 'sg' | 'pl'

export function abbreviateNumber(value: NumberValue): NumberAbbrev {
  return value === 'singular' ? 'sg' : 'pl'
}

export function expandNumberAbbrev(value: NumberAbbrev): NumberValue {
  return value === 'sg' ? 'singular' : 'plural'
}

/** Concrete (non-aggregate) genders — what an ADJ dimension string ever actually carries,
 *  once `enumerate.ts` has expanded any aggregate gender via the task-02 breakdown. */
export type ConcreteGenderValue = Exclude<GenderValue, AdjGenderAggregate>

// ---------------------------------------------------------------------------
// Dimension namespace (architecture.md §5.1, verified against the real paradigm data by
// this task — see enumerate.ts for the exact construction rules and their rationale).
// ---------------------------------------------------------------------------

export type VocabDimension = 'vocab:pl-ru' | 'vocab:ru-pl'

export type NounDimension = `noun:${NumberAbbrev}:${CaseValue}`

export type VerbPresentFutureDimension =
  `verb:${'present' | 'future'}:${PersonValue}:${NumberAbbrev}`
/** Past tense distinguishes gender; VERB uses `non_masculine_personal` etc. as genuine
 *  terminal values here (Polish plural past syncretism), never expanded — unlike ADJ. */
export type VerbPastDimension = `verb:past:${PersonValue}:${NumberAbbrev}:${GenderValue}`
export type VerbImperativeDimension = `verb:imperative:${PersonValue}:${NumberAbbrev}`
export type VerbDimension = VerbPresentFutureDimension | VerbPastDimension | VerbImperativeDimension

export type AdjCaseDimension = `adj:${NumberAbbrev}:${ConcreteGenderValue}:${CaseValue}`
export type AdjDegreeDimension = `adj:degree:${DegreeValue}`
export type AdjDimension = AdjCaseDimension | AdjDegreeDimension

export type AdvDimension = `adv:degree:${DegreeValue}`

export type Dimension = VocabDimension | NounDimension | VerbDimension | AdjDimension | AdvDimension

// ---------------------------------------------------------------------------
// Canonical display order — UI must not re-sort these itself (task text, step 2).
// Case order already matches the Polish school mnemonic (M. D. C. B. N. Ms. W.) as
// declared in `content/codec.ts`'s `CASE_VALUES`, so it is reused as-is.
// ---------------------------------------------------------------------------

export const CASE_DISPLAY_ORDER: readonly CaseValue[] = CASE_VALUES
export const PERSON_DISPLAY_ORDER: readonly PersonValue[] = PERSON_VALUES
export const TENSE_DISPLAY_ORDER: readonly TenseValue[] = TENSE_VALUES
export const DEGREE_DISPLAY_ORDER: readonly DegreeValue[] = DEGREE_VALUES
export const NUMBER_DISPLAY_ORDER: readonly NumberValue[] = ['singular', 'plural']

/** Display order for the 5 concrete declension genders (m-personal, m-animate,
 *  m-inanimate, feminine, neuter) — distinct from `content/codec.ts`'s `GENDER_VALUES`,
 *  whose order is a codec detail (aggregates trail at the end), not a display order. */
export const GENDER_DISPLAY_ORDER: readonly ConcreteGenderValue[] = [
  'masculine_personal',
  'masculine_animate',
  'masculine_inanimate',
  'feminine',
  'neuter',
]

// ---------------------------------------------------------------------------
// Bilingual labels — Polish shown primary (the user is learning Polish grammar
// terminology), Russian secondary (task text, step 2).
// ---------------------------------------------------------------------------

export interface DimensionLabel {
  readonly pl: string
  readonly ru: string
}

export const CASE_LABELS: Readonly<Record<CaseValue, DimensionLabel>> = {
  nominative: { pl: 'Mianownik', ru: 'Именительный' },
  genitive: { pl: 'Dopełniacz', ru: 'Родительный' },
  dative: { pl: 'Celownik', ru: 'Дательный' },
  accusative: { pl: 'Biernik', ru: 'Винительный' },
  instrumental: { pl: 'Narzędnik', ru: 'Творительный' },
  locative: { pl: 'Miejscownik', ru: 'Предложный' },
  vocative: { pl: 'Wołacz', ru: 'Звательный' },
}

export const NUMBER_LABELS: Readonly<Record<NumberValue, DimensionLabel>> = {
  singular: { pl: 'Liczba pojedyncza', ru: 'Единственное число' },
  plural: { pl: 'Liczba mnoga', ru: 'Множественное число' },
}

export const TENSE_LABELS: Readonly<Record<TenseValue, DimensionLabel>> = {
  present: { pl: 'Czas teraźniejszy', ru: 'Настоящее время' },
  past: { pl: 'Czas przeszły', ru: 'Прошедшее время' },
  future: { pl: 'Czas przyszły', ru: 'Будущее время' },
}

export const DEGREE_LABELS: Readonly<Record<DegreeValue, DimensionLabel>> = {
  positive: { pl: 'Stopień równy', ru: 'Положительная степень' },
  comparative: { pl: 'Stopień wyższy', ru: 'Сравнительная степень' },
  superlative: { pl: 'Stopień najwyższy', ru: 'Превосходная степень' },
}

/** Added by task 19 (`spec/tasks/19-practice-mode.md` step 1) for the verb section of
 *  `features/training-setup/**`'s "Лица" dimension group — same `{pl, ru}` shape and
 *  construction as every other `*_LABELS` map above, keyed by `PersonValue` (1/2/3). */
export const PERSON_LABELS: Readonly<Record<PersonValue, DimensionLabel>> = {
  1: { pl: '1. osoba', ru: '1-е лицо' },
  2: { pl: '2. osoba', ru: '2-е лицо' },
  3: { pl: '3. osoba', ru: '3-е лицо' },
}

/** Covers every `GenderValue`, including the 4 ADJ aggregates and the bare `masculine`
 *  used for VERB's non-declining nom/voc-sg-style slots — not just the 5 concrete genders
 *  in `GENDER_DISPLAY_ORDER` — so any dimension actually produced by `enumerate.ts` (ADJ
 *  post-expansion or VERB past-tense) always resolves to a label. */
export const GENDER_LABELS: Readonly<Record<GenderValue, DimensionLabel>> = {
  feminine: { pl: 'żeński', ru: 'женский' },
  masculine_personal: { pl: 'męskoosobowy', ru: 'мужской личный' },
  masculine_inanimate: { pl: 'męskorzeczowy', ru: 'мужской неодушевлённый' },
  masculine_animate: { pl: 'męskożywotny', ru: 'мужской одушевлённый' },
  neuter: { pl: 'nijaki', ru: 'средний' },
  non_masculine_personal: { pl: 'niemęskoosobowy', ru: 'немужской личный' },
  any: { pl: 'dowolny', ru: 'любой' },
  masculine_animate_or_personal: { pl: 'męskożywotny/-osobowy', ru: 'мужской одуш./личный' },
  masculine_or_neuter: { pl: 'męski/nijaki', ru: 'мужской/средний' },
  masculine: { pl: 'męski', ru: 'мужской' },
}

// ---------------------------------------------------------------------------
// describeDimension — a display-ready label pair for one concrete Dimension string, used by
// `features/session-runner/**`'s form-exercise components (task 18,
// `spec/tasks/18-noun-exercises.md` step 6: "польское название падежа + число — основное,
// русское — мелким шрифтом"). Only NOUN dimensions are implemented by this task — task 18's
// own scope is nouns only, and VERB/ADJ/ADV have no dedicated exercise UI yet (tasks 20-22).
// A dimension kind this function doesn't yet know how to describe falls back to the raw
// string on both sides rather than throwing, so a later task can add its own case here
// without this module (or its callers) needing to change shape.
// ---------------------------------------------------------------------------

export interface DimensionDisplay {
  /** The slot's most specific grammatical fact — a NOUN's case, a VERB's tense, etc. */
  readonly primary: DimensionLabel
  /** A secondary axis shown alongside `primary`, when the dimension has one (NOUN's
   *  number). Absent for dimensions with only one axis. */
  readonly secondary?: DimensionLabel
}

export function describeDimension(dimension: Dimension): DimensionDisplay {
  const separatorIndex = dimension.indexOf(':')
  const kind = separatorIndex === -1 ? dimension : dimension.slice(0, separatorIndex)

  if (kind === 'noun') {
    const [, numberAbbrev, caseValue] = dimension.split(':') as ['noun', NumberAbbrev, CaseValue]
    return {
      primary: CASE_LABELS[caseValue],
      secondary: NUMBER_LABELS[expandNumberAbbrev(numberAbbrev)],
    }
  }

  return { primary: { pl: dimension, ru: dimension } }
}
