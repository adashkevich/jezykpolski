/**
 * Paradigm access and display-table shaping (`spec/tasks/04-content-access-layer.md` §4).
 *
 * `getParadigm` is the only function here that touches the network (via `loader.ts`'s
 * deduplicated shard cache). Everything else — `getFormsForSlot` and the three
 * `build*Table` functions — is a pure, synchronous view over an already-loaded
 * {@link Paradigm}.
 *
 * `NounTable` / `VerbTable` / `AdjTable` are this task's own design: `spec/app-design.md`
 * §13/§14 sketch the display shape (case × number grid for nouns; case × gender grid, one
 * number at a time, for adjectives; person × number rows, one tense/mood at a time, with an
 * extra gender axis for past tense, for verbs) but no task before this one declared types
 * for them.
 */
import {
  ADJ_GENDER_AGGREGATE_EXPANSION,
  isAdjGenderAggregate,
  type CaseValue,
  type DecodedForm,
  type GenderValue,
  type NumberValue,
  type PersonValue,
} from './codec.ts'
import {
  abbreviateNumber,
  CASE_DISPLAY_ORDER,
  GENDER_DISPLAY_ORDER,
  NUMBER_DISPLAY_ORDER,
  PERSON_DISPLAY_ORDER,
  type ConcreteGenderValue,
  type Dimension,
} from '@/learning/skills/dimensions.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import { loadParadigmShard } from './loader.ts'
import { getIndexStore } from './index-store.ts'

// ---------------------------------------------------------------------------
// getParadigm — the one async, network-touching entry point.
// ---------------------------------------------------------------------------

/**
 * Resolves `wordId`'s inflection paradigm.
 *  - Returns `null` (never throws) for the 14 real words that have no paradigm at all
 *    (`paradigmShard === -1` in the index — task 02 §6, e.g. pronouns, bound letters).
 *  - Throws if `wordId` isn't in the index at all — that's a caller bug, not a normal
 *    "no data" case, so it should surface loudly rather than look like a paradigm-less word.
 *  - Delegates the actual fetch to `loader.ts`'s `loadParadigmShard`, which already
 *    memoizes per shard number and dedupes concurrent callers — calling `getParadigm`
 *    twice for two words in the same shard, or twice for the same word, never issues a
 *    second network request.
 */
export async function getParadigm(wordId: WordId): Promise<Paradigm | null> {
  const entry = getIndexStore().byId.get(wordId)
  if (!entry) {
    throw new Error(`getParadigm: unknown wordId "${wordId}"`)
  }
  if (entry.paradigmShard === -1) return null
  const shard = await loadParadigmShard(entry.paradigmShard)
  return shard.get(wordId) ?? null
}

// ---------------------------------------------------------------------------
// getFormsForSlot — the inverse of `learning/skills/enumerate.ts`'s (private)
// `dimensionsForForm`: given a `Dimension`, which forms in the paradigm belong to it.
// `learning/**` is read-only for this task (and doesn't export that function anyway), so
// this is a fresh, independent implementation over the same wire format, not a call into it.
// ---------------------------------------------------------------------------

/**
 * Matches one decoded form against a `Dimension` string. Assumes `dimension` is a
 * well-formed value of the `Dimension` union — the type system already guarantees that at
 * every call site in this file; the `!` assertions below only silence
 * `noUncheckedIndexedAccess` on the `.split(':')` result, they don't relax that contract.
 */
function matchesDimension(form: DecodedForm, dimension: Dimension): boolean {
  const parts = dimension.split(':')
  const kind = parts[0]!

  switch (kind) {
    case 'noun': {
      const numberAbbrev = parts[1]!
      const caseValue = parts[2]!
      return (
        form.number !== undefined &&
        form.case === caseValue &&
        abbreviateNumber(form.number) === numberAbbrev
      )
    }

    case 'verb': {
      const second = parts[1]!

      if (second === 'past') {
        const personStr = parts[2]!
        const numberAbbrev = parts[3]!
        const gender = parts[4]!
        return (
          form.mood === 'indicative' &&
          form.tense === 'past' &&
          form.person !== undefined &&
          String(form.person) === personStr &&
          form.number !== undefined &&
          abbreviateNumber(form.number) === numberAbbrev &&
          form.gender === gender
        )
      }

      if (second === 'imperative') {
        const personStr = parts[2]!
        const numberAbbrev = parts[3]!
        return (
          form.mood === 'imperative' &&
          form.person !== undefined &&
          String(form.person) === personStr &&
          form.number !== undefined &&
          abbreviateNumber(form.number) === numberAbbrev
        )
      }

      // present | future
      const personStr = parts[2]!
      const numberAbbrev = parts[3]!
      return (
        form.mood === 'indicative' &&
        form.tense === second &&
        form.person !== undefined &&
        String(form.person) === personStr &&
        form.number !== undefined &&
        abbreviateNumber(form.number) === numberAbbrev
      )
    }

    case 'adj': {
      if (parts[1] === 'degree') {
        const degree = parts[2]!
        // Only the citation slot (singular nominative bare-masculine) feeds
        // `adj:degree:*` — mirrors `enumerate.ts`'s rule exactly.
        return (
          form.degree === degree &&
          form.number === 'singular' &&
          form.case === 'nominative' &&
          form.gender === 'masculine'
        )
      }
      const numberAbbrev = parts[1]!
      const gender = parts[2]! as GenderValue
      const caseValue = parts[3]!
      if (form.degree !== 'positive') return false
      if (form.number === undefined || form.case !== caseValue) return false
      if (abbreviateNumber(form.number) !== numberAbbrev) return false
      if (form.gender === undefined) return false
      if (form.gender === gender) return true
      // An aggregate-gender form (e.g. plural genitive, which doesn't distinguish gender at
      // all -> `any`) stands in for every concrete gender it expands to.
      if (isAdjGenderAggregate(form.gender)) {
        return (ADJ_GENDER_AGGREGATE_EXPANSION[form.gender] as readonly GenderValue[]).includes(
          gender,
        )
      }
      // The bare `masculine` gender (distinct from the 4 `AdjGenderAggregate` values above)
      // shows up on real singular nominative/vocative ADJ forms — e.g. `dobry|ADJ`'s "dobry"
      // itself (verified against `public/content/paradigms/006.json`): Polish genuinely
      // doesn't distinguish personal/animate/inanimate in that slot, so the one stored form
      // is the correct answer for all three concrete masculine columns. Display-only, same
      // as the aggregate case above — `learning/skills/enumerate.ts`'s skill *dimensions*
      // are untouched by this (out of this task's scope; see this task's decision log).
      if (form.gender === 'masculine') {
        return (
          gender === 'masculine_personal' ||
          gender === 'masculine_animate' ||
          gender === 'masculine_inanimate'
        )
      }
      return false
    }

    case 'adv': {
      const degree = parts[2]!
      return form.degree === degree
    }

    default:
      return false
  }
}

/** Every distinct literal form the paradigm has for `dimension`, in first-seen order,
 *  de-duplicated (mirrors `enumerate.ts`'s `acceptedAnswers` de-dup rule for skills). */
export function getFormsForSlot(paradigm: Paradigm, dimension: Dimension): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const form of paradigm.forms) {
    if (matchesDimension(form, dimension) && !seen.has(form.form)) {
      seen.add(form.form)
      result.push(form.form)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// buildNounTable — case x number.
// ---------------------------------------------------------------------------

export interface NounTableRow {
  readonly case: CaseValue
  readonly singular: readonly string[]
  readonly plural: readonly string[]
}

export interface NounTable {
  /** One row per case, in `CASE_DISPLAY_ORDER` (7 rows for a complete NOUN paradigm). */
  readonly rows: readonly NounTableRow[]
}

export function buildNounTable(paradigm: Paradigm): NounTable {
  const rows = CASE_DISPLAY_ORDER.map((caseValue): NounTableRow => ({
    case: caseValue,
    singular: getFormsForSlot(paradigm, `noun:sg:${caseValue}`),
    plural: getFormsForSlot(paradigm, `noun:pl:${caseValue}`),
  }))
  return { rows }
}

// ---------------------------------------------------------------------------
// buildVerbTable — tense/mood x person x number (+ gender for past).
// ---------------------------------------------------------------------------

export interface VerbConjugationRow {
  readonly person: PersonValue
  readonly number: NumberValue
  /** Only set on `past` rows — Polish past tense marks gender (masculine/feminine/neuter in
   *  singular, masculine_personal/non_masculine_personal in plural). */
  readonly gender?: GenderValue
  readonly forms: readonly string[]
  /**
   * True when every form in this slot is an analytic construction (the imperfective future,
   * e.g. `będę robić` — `codec.ts`'s `analytic` bit on the underlying `DecodedForm`, task
   * 02). Always `false` for `present`/`imperative`/`past` rows — only imperfective `future`
   * ever sets this. Added by task 08 (`spec/tasks/08-word-detail.md` §3/acceptance:
   * "аналитические формы... помечены"); task 04's `getFormsForSlot` collapses a slot down to
   * its literal form strings and drops this bit, so it's recovered here straight from the
   * matching `DecodedForm`s rather than re-derived some other way.
   */
  readonly analytic: boolean
  /**
   * Which of `forms` are themselves analytic (added by task 20 for the 84 mixed-aspect
   * verbs, `spec/tasks/20-verbs-section.md` §3: a slot like `verb:future:1:pl` can hold both
   * a perfective non-analytic form and an imperfective analytic one at once, e.g.
   * `przypadamy` / `będziemy przypadać` for `przypadać|VERB` — `matchesDimension` never
   * filters on `aspect` (there is no `aspect` dimension, architecture.md §5.1), so both
   * already land in `forms` together; this field only lets the display layer badge the
   * right one instead of badging (or not badging) the whole row). A subset of `forms`, same
   * order. Always `[]` for `past` rows (Polish past tense is never analytic).
   */
  readonly analyticForms: readonly string[]
}

export interface VerbTable {
  readonly present: readonly VerbConjugationRow[]
  readonly future: readonly VerbConjugationRow[]
  readonly imperative: readonly VerbConjugationRow[]
  readonly past: readonly VerbConjugationRow[]
}

/** Which `GenderValue`s Polish past tense actually distinguishes, per number — verified
 *  against the real `być|VERB` paradigm (`public/content/paradigms/014.json`): singular
 *  uses the bare `masculine`/`feminine`/`neuter`, plural uses
 *  `masculine_personal`/`non_masculine_personal`. Never the ADJ aggregate breakdown. */
const PAST_GENDERS_BY_NUMBER: Readonly<Record<NumberValue, readonly GenderValue[]>> = {
  singular: ['masculine', 'feminine', 'neuter'],
  plural: ['masculine_personal', 'non_masculine_personal'],
}

/** Same de-dup walk as `getFormsForSlot`, plus which of those forms carry the `analytic` bit
 *  — one pass over `paradigm.forms` instead of two separate scans. Not exported: this is
 *  `buildPersonNumberRows`'s own need (`getFormsForSlot` stays the general-purpose,
 *  analytic-agnostic entry point every other table/consumer uses). */
function verbSlotForms(
  paradigm: Paradigm,
  dimension: Dimension,
): { forms: string[]; analyticForms: string[] } {
  const seen = new Set<string>()
  const forms: string[] = []
  const analyticForms: string[] = []
  for (const form of paradigm.forms) {
    if (!matchesDimension(form, dimension) || seen.has(form.form)) continue
    seen.add(form.form)
    forms.push(form.form)
    if (form.analytic) analyticForms.push(form.form)
  }
  return { forms, analyticForms }
}

function buildPersonNumberRows(
  paradigm: Paradigm,
  makeDimension: (person: PersonValue, number: NumberValue) => Dimension,
): VerbConjugationRow[] {
  const rows: VerbConjugationRow[] = []
  for (const person of PERSON_DISPLAY_ORDER) {
    for (const number of NUMBER_DISPLAY_ORDER) {
      const dimension = makeDimension(person, number)
      const { forms, analyticForms } = verbSlotForms(paradigm, dimension)
      if (forms.length > 0) {
        rows.push({ person, number, forms, analytic: analyticForms.length > 0, analyticForms })
      }
    }
  }
  return rows
}

function buildPastRows(paradigm: Paradigm): VerbConjugationRow[] {
  const rows: VerbConjugationRow[] = []
  for (const person of PERSON_DISPLAY_ORDER) {
    for (const number of NUMBER_DISPLAY_ORDER) {
      for (const gender of PAST_GENDERS_BY_NUMBER[number]) {
        const dimension: Dimension = `verb:past:${person}:${abbreviateNumber(number)}:${gender}`
        const forms = getFormsForSlot(paradigm, dimension)
        // Past tense is never analytic (isDimensionAnalytic would always be false here too —
        // no `raw_tag` in the real data ever marks a past form analytic), so this is a plain
        // literal rather than another `isDimensionAnalytic` call, to make that fact visible
        // at the call site instead of implicit in what the data happens to contain.
        if (forms.length > 0) {
          rows.push({ person, number, gender, forms, analytic: false, analyticForms: [] })
        }
      }
    }
  }
  return rows
}

export function buildVerbTable(paradigm: Paradigm): VerbTable {
  return {
    present: buildPersonNumberRows(
      paradigm,
      (person, number) => `verb:present:${person}:${abbreviateNumber(number)}`,
    ),
    future: buildPersonNumberRows(
      paradigm,
      (person, number) => `verb:future:${person}:${abbreviateNumber(number)}`,
    ),
    imperative: buildPersonNumberRows(
      paradigm,
      (person, number) => `verb:imperative:${person}:${abbreviateNumber(number)}`,
    ),
    past: buildPastRows(paradigm),
  }
}

// ---------------------------------------------------------------------------
// buildAdjTable — case x gender, for one number at a time.
// ---------------------------------------------------------------------------

export interface AdjTableRow {
  readonly case: CaseValue
  /** Keyed by the 5 concrete declension genders (`GENDER_DISPLAY_ORDER`); a gender with no
   *  form for this case/number (rare — most ADJ paradigms are complete) is simply absent. */
  readonly forms: Readonly<Partial<Record<ConcreteGenderValue, readonly string[]>>>
}

export interface AdjTable {
  readonly number: NumberValue
  readonly rows: readonly AdjTableRow[]
}

export function buildAdjTable(paradigm: Paradigm, number: NumberValue): AdjTable {
  const numberAbbrev = abbreviateNumber(number)
  const rows = CASE_DISPLAY_ORDER.map((caseValue): AdjTableRow => {
    const forms: Partial<Record<ConcreteGenderValue, readonly string[]>> = {}
    for (const gender of GENDER_DISPLAY_ORDER) {
      const dimension: Dimension = `adj:${numberAbbrev}:${gender}:${caseValue}`
      const matched = getFormsForSlot(paradigm, dimension)
      if (matched.length > 0) forms[gender] = matched
    }
    return { case: caseValue, forms }
  })
  return { number, rows }
}
