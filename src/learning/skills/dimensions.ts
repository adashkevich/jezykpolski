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

/** `spec/tasks/21-verb-exercises.md`'s own scope: VERB's `imperative` mood has no `TenseValue`
 *  (`content/codec.ts`'s `TENSE_VALUES` is `present`/`past`/`future` only — mood and tense are
 *  separate axes there), so it needs its own label rather than a `TENSE_LABELS` entry. Also
 *  reused by `features/session-results/lib/dimension-group.ts` (task 14, predates this one)
 *  instead of that module's own copy, so the two "Tryb rozkazujący" strings shown across the
 *  app (session-results breakdown, verb exercise prompt) can never drift apart. */
export const IMPERATIVE_LABEL: DimensionLabel = {
  pl: 'Tryb rozkazujący',
  ru: 'Повелительное наклонение',
}

/**
 * Bilingual pronoun for one (person, number) pair — `spec/app-design.md` §13's exercise
 * mockups show the pronoun itself as the prompt's first line ("ty", "my"), not a generic
 * "2. osoba" (that generic form is `PERSON_LABELS` above, used by
 * `features/training-setup/**`'s filter checkboxes, a different UI with a different need).
 * 3rd person singular/plural have no single Polish pronoun without knowing gender too
 * (`on`/`ona`/`ono`, `oni`/`one`) — `present`/`future`/`imperative` dimensions carry no
 * gender at all (only VERB `past` does), so those two cells combine all the candidates,
 * matching the exact convention `word-detail/components/forms/VerbFormsTable.tsx`'s own
 * (undecoupled, plain-string) `PERSON_PRONOUNS` table already uses for the same ambiguity in
 * its table headers ("on · ona · ono").
 */
const PERSON_PRONOUN_LABELS: Readonly<Record<PersonValue, { sg: DimensionLabel; pl: DimensionLabel }>> = {
  1: { sg: { pl: 'ja', ru: 'я' }, pl: { pl: 'my', ru: 'мы' } },
  2: { sg: { pl: 'ty', ru: 'ты' }, pl: { pl: 'wy', ru: 'вы' } },
  3: {
    sg: { pl: 'on · ona · ono', ru: 'он · она · оно' },
    pl: { pl: 'oni · one', ru: 'они' },
  },
}

/**
 * VERB `past`'s 5 real terminal genders (`enumerate.ts`'s own doc comment: masculine /
 * feminine / neuter in singular, masculine_personal / non_masculine_personal in plural) each
 * resolve to a concrete 3rd-person pronoun, *unlike* the ambiguous combined forms above —
 * `past` dimensions always carry gender, so `on`/`ona`/`ono`/`oni`/`one` is exactly
 * determined. `person` 1/2 never varies by gender in Polish (`ja`/`ty`/`my`/`wy` regardless
 * of the speaker's gender — only the *verb form itself* differs, e.g. `robiłem`/`robiłam`),
 * so those two persons just reuse `PERSON_PRONOUN_LABELS` above.
 */
function pastPronounLabel(person: PersonValue, number: NumberValue, gender: GenderValue): DimensionLabel {
  if (person !== 3) return PERSON_PRONOUN_LABELS[person][number === 'singular' ? 'sg' : 'pl']
  if (number === 'singular') {
    if (gender === 'masculine') return { pl: 'on', ru: 'он' }
    if (gender === 'feminine') return { pl: 'ona', ru: 'она' }
    if (gender === 'neuter') return { pl: 'ono', ru: 'оно' }
  } else {
    if (gender === 'masculine_personal') return { pl: 'oni', ru: 'они' }
    if (gender === 'non_masculine_personal') return { pl: 'one', ru: 'они' }
  }
  // Unreachable for any `verb:past:*` dimension `enumerate.ts` actually produces (its own
  // doc comment: those are the only 5 gender values past tense ever carries) — falls back to
  // the ambiguous combined form rather than throwing, same defensive posture as
  // `describeDimension`'s own top-level fallback.
  return PERSON_PRONOUN_LABELS[person][number === 'singular' ? 'sg' : 'pl']
}

/**
 * FR-66 requires the past-tense prompt to show *which* gender is being asked for
 * ("`ja + mężczyzna → robiłem`", `spec/app-design.md` §13's exact mockup: "ja / mężczyzna /
 * czas przeszły"), as a natural human noun — not `GENDER_LABELS`' grammatical adjective
 * ("męski"), which is what the word-detail table's column headers use instead
 * (`VerbFormsTable.tsx`'s `PastTenseTable`, a different, already-shipped UI with a different
 * job: labelling a whole column of forms, not restating "who is speaking" as a question
 * prompt). Neuter/plural have no literal "biological gender" reading (Polish past-tense
 * neuter/non-masculine-personal are grammatical agreement classes, not people) — `dziecko`/
 * `kobiety` are this task's own choice of a natural representative noun for each class,
 * recorded here for the decision log rather than invented silently.
 */
const PAST_SUBJECT_LABELS: Readonly<Record<'masculine' | 'feminine' | 'neuter' | 'masculine_personal' | 'non_masculine_personal', DimensionLabel>> = {
  masculine: { pl: 'mężczyzna', ru: 'мужчина' },
  feminine: { pl: 'kobieta', ru: 'женщина' },
  neuter: { pl: 'dziecko', ru: 'ребёнок' },
  masculine_personal: { pl: 'mężczyźni', ru: 'мужчины' },
  non_masculine_personal: { pl: 'kobiety', ru: 'женщины' },
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
  /** The slot's most specific grammatical fact — a NOUN's case, a VERB's pronoun, etc. */
  readonly primary: DimensionLabel
  /** A secondary axis shown alongside `primary`, when the dimension has one (NOUN's
   *  number, VERB present/future's tense). Absent for dimensions with only one axis. */
  readonly secondary?: DimensionLabel
  /**
   * A third axis, present only for VERB `past` (FR-66: person + gender + tense is 3
   * independent facts, not 2 — `spec/app-design.md` §13's mockup literally stacks 3 lines,
   * "ja / mężczyzna / czas przeszły"). Added by this task rather than repurposing
   * `secondary` for one of the two axes, so every existing `primary`/`secondary` caller
   * (`FormInputExercise.tsx`/`FormChoiceExercise.tsx`'s NOUN rendering, task 18) keeps
   * compiling and rendering unchanged — `tertiary` is additive, never required.
   */
  readonly tertiary?: DimensionLabel
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

  if (kind === 'verb') {
    const parts = dimension.split(':')

    if (parts[1] === 'past') {
      // verb:past:<person>:<sg|pl>:<gender>
      const person = Number(parts[2]) as PersonValue
      const number = expandNumberAbbrev(parts[3] as NumberAbbrev)
      const gender = parts[4] as GenderValue
      const pastGenderLabel =
        PAST_SUBJECT_LABELS[gender as keyof typeof PAST_SUBJECT_LABELS] ?? GENDER_LABELS[gender]
      return {
        primary: pastPronounLabel(person, number, gender),
        secondary: pastGenderLabel,
        tertiary: TENSE_LABELS.past,
      }
    }

    if (parts[1] === 'imperative') {
      // verb:imperative:<person>:<sg|pl>
      const person = Number(parts[2]) as PersonValue
      const numberAbbrev = parts[3] as NumberAbbrev
      return {
        primary: PERSON_PRONOUN_LABELS[person][numberAbbrev],
        secondary: IMPERATIVE_LABEL,
      }
    }

    // verb:<present|future>:<person>:<sg|pl>
    const tense = parts[1] as TenseValue
    const person = Number(parts[2]) as PersonValue
    const numberAbbrev = parts[3] as NumberAbbrev
    return {
      primary: PERSON_PRONOUN_LABELS[person][numberAbbrev],
      secondary: TENSE_LABELS[tense],
    }
  }

  // Task 22 (`spec/tasks/22-adjectives-section.md`): ADJ/ADV had no `describeDimension`
  // branch before this task — `FormInputExercise.tsx`/`FormChoiceExercise.tsx` (tasks 18/21)
  // are already POS-agnostic and only needed this module to learn the two new dimension
  // shapes, no exercise-generation changes (`generate.ts#buildFormInput`/`buildFormChoice`
  // already pass `entry.lemma` as `lemma`, which for an ADJ *is* the positive-degree form —
  // `spec/app-design.md` §14's own mockup literally builds the degree prompt on top of it:
  // "dobry -> [ lepszy ] -> [ najlepszy ]").
  if (kind === 'adj') {
    const parts = dimension.split(':')
    if (parts[1] === 'degree') {
      // adj:degree:<comparative|superlative> (FR-69) — the word itself (shown separately as
      // the exercise prompt, see above) already says *which* word; this only needs to say
      // *which degree* is being asked for.
      const degree = parts[2] as DegreeValue
      return { primary: DEGREE_LABELS[degree] }
    }
    // adj:<sg|pl>:<gender>:<case> (FR-67: "падеж + число + род"). Order matches
    // `spec/app-design.md` §14's first mockup exactly ("Genitive / singular / feminine").
    const numberAbbrev = parts[1] as NumberAbbrev
    const gender = parts[2] as GenderValue
    const caseValue = parts[3] as CaseValue
    return {
      primary: CASE_LABELS[caseValue],
      secondary: NUMBER_LABELS[expandNumberAbbrev(numberAbbrev)],
      tertiary: GENDER_LABELS[gender],
    }
  }

  if (kind === 'adv') {
    // adv:degree:<degree> — FR-05: adverbs carry no other dimension in the real data.
    const degree = dimension.split(':')[2] as DegreeValue
    return { primary: DEGREE_LABELS[degree] }
  }

  return { primary: { pl: dimension, ru: dimension } }
}
