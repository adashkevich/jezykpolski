/**
 * Declarative per-section configuration for `TrainingSetupScreen` (`spec/tasks/19-practice-mode.md`
 * §1, FR-113: "единый компонент... не писать три похожих экрана").
 *
 * `TrainingDimensionGroup` is the task text's own interface, verbatim (its snippet in the
 * task file). Each `PracticeSection` gets its own array of groups — NOUN gets "Числа" +
 * "Падежи"; VERB gets "Времена" + "Лица" + "Числа"; ADJ gets "Числа" + "Роды" + "Падежи" +
 * "Степени" — built from `learning/skills/dimensions.ts`'s existing display-order constants
 * and bilingual labels (plus this task's own new `PERSON_LABELS`), never a hand-typed second
 * copy of the case/tense/person/gender/degree lists. `option.value` is always the exact raw
 * segment `Dimension.split(':')` would produce for that axis (e.g. person `'1'`/`'2'`/`'3'`
 * as decimal strings, not the numeric `PersonValue`) — `build-practice-queue.ts`'s matchers
 * compare against these verbatim, no re-parsing on either side.
 */
import {
  CASE_DISPLAY_ORDER,
  CASE_LABELS,
  DEGREE_LABELS,
  GENDER_DISPLAY_ORDER,
  GENDER_LABELS,
  NUMBER_DISPLAY_ORDER,
  PERSON_DISPLAY_ORDER,
  PERSON_LABELS,
  TENSE_DISPLAY_ORDER,
  TENSE_LABELS,
  abbreviateNumber,
  type Dimension,
} from '@/learning/skills/dimensions.ts'
import { isDimensionTrainedByDefault } from '@/learning/skills/training-defaults.ts'
import type { PracticeSection } from '@/learning/session/session.types.ts'

export interface TrainingDimensionOption {
  readonly value: string
  readonly label: string
  readonly labelRu: string
  readonly defaultOn: boolean
}

export interface TrainingDimensionGroup {
  readonly key: string
  readonly label: string
  readonly labelRu: string
  readonly options: readonly TrainingDimensionOption[]
}

export interface TrainingSectionDefinition {
  readonly section: PracticeSection
  /** "Тренировка существительных" / "...глаголов" / "...прилагательных" — the screen's own
   *  `<h1>` (`spec/app-design.md` §23's mockup title). */
  readonly title: string
  readonly dimensionGroups: readonly TrainingDimensionGroup[]
}

const NUMBER_OPTIONS: readonly TrainingDimensionOption[] = NUMBER_DISPLAY_ORDER.map((value) => ({
  value: abbreviateNumber(value),
  label: value === 'singular' ? 'Liczba pojedyncza' : 'Liczba mnoga',
  labelRu: value === 'singular' ? 'Единственное число' : 'Множественное число',
  defaultOn: true,
}))

/** Wołacz off by default (task text: "используй `isDimensionTrainedByDefault` для... Wołacz
 *  в конфигураторе") — `noun:sg:<case>` is an arbitrary carrier dimension here purely to ask
 *  the shared predicate "is this case excluded by default"; the function only ever looks at
 *  the case suffix, never the number prefix (see its own doc comment). */
const NOUN_CASE_OPTIONS: readonly TrainingDimensionOption[] = CASE_DISPLAY_ORDER.map((value) => ({
  value,
  label: CASE_LABELS[value].pl,
  labelRu: CASE_LABELS[value].ru,
  defaultOn: isDimensionTrainedByDefault(`noun:sg:${value}` as Dimension),
}))

/** ADJ's own case group — same "Wołacz off by default" UX rule as NOUN's, but ADJ vocative
 *  forms mostly mirror the nominative and aren't what `training-defaults.ts`'s predicate
 *  covers (it's specific to NOUN slots) — applied here directly rather than routed through
 *  that NOUN-only function, so its own doc comment's scope stays accurate. */
const ADJ_CASE_OPTIONS: readonly TrainingDimensionOption[] = CASE_DISPLAY_ORDER.map((value) => ({
  value,
  label: CASE_LABELS[value].pl,
  labelRu: CASE_LABELS[value].ru,
  defaultOn: value !== 'vocative',
}))

const GENDER_OPTIONS: readonly TrainingDimensionOption[] = GENDER_DISPLAY_ORDER.map((value) => ({
  value,
  label: GENDER_LABELS[value].pl,
  labelRu: GENDER_LABELS[value].ru,
  defaultOn: true,
}))

const TENSE_OPTIONS: readonly TrainingDimensionOption[] = TENSE_DISPLAY_ORDER.map((value) => ({
  value,
  label: TENSE_LABELS[value].pl,
  labelRu: TENSE_LABELS[value].ru,
  defaultOn: true,
}))

const PERSON_OPTIONS: readonly TrainingDimensionOption[] = PERSON_DISPLAY_ORDER.map((value) => ({
  value: String(value),
  label: PERSON_LABELS[value].pl,
  labelRu: PERSON_LABELS[value].ru,
  defaultOn: true,
}))

/** Comparative/superlative only — `positive` degree is what the case/gender/number group
 *  already governs (`enumerate.ts`'s own ADJ rule: positive-degree forms feed
 *  `adj:<number>:<gender>:<case>`, comparative/superlative feed `adj:degree:<degree>`), so
 *  offering a `positive` checkbox here would have no matching dimension at all. */
const ADJ_DEGREE_OPTIONS: readonly TrainingDimensionOption[] = [
  {
    value: 'comparative',
    label: DEGREE_LABELS.comparative.pl,
    labelRu: DEGREE_LABELS.comparative.ru,
    defaultOn: true,
  },
  {
    value: 'superlative',
    label: DEGREE_LABELS.superlative.pl,
    labelRu: DEGREE_LABELS.superlative.ru,
    defaultOn: true,
  },
]

export const TRAINING_SECTIONS: Readonly<Record<PracticeSection, TrainingSectionDefinition>> = {
  NOUN: {
    section: 'NOUN',
    title: 'Тренировка существительных',
    dimensionGroups: [
      { key: 'number', label: 'Liczby', labelRu: 'Числа', options: NUMBER_OPTIONS },
      { key: 'case', label: 'Przypadki', labelRu: 'Падежи', options: NOUN_CASE_OPTIONS },
    ],
  },
  VERB: {
    section: 'VERB',
    title: 'Тренировка глаголов',
    dimensionGroups: [
      { key: 'tense', label: 'Czasy', labelRu: 'Времена', options: TENSE_OPTIONS },
      { key: 'person', label: 'Osoby', labelRu: 'Лица', options: PERSON_OPTIONS },
      { key: 'number', label: 'Liczby', labelRu: 'Числа', options: NUMBER_OPTIONS },
    ],
  },
  ADJ: {
    section: 'ADJ',
    title: 'Тренировка прилагательных',
    dimensionGroups: [
      { key: 'number', label: 'Liczby', labelRu: 'Числа', options: NUMBER_OPTIONS },
      { key: 'gender', label: 'Rodzaje', labelRu: 'Роды', options: GENDER_OPTIONS },
      { key: 'case', label: 'Przypadki', labelRu: 'Падежи', options: ADJ_CASE_OPTIONS },
      { key: 'degree', label: 'Stopnie', labelRu: 'Степени сравнения', options: ADJ_DEGREE_OPTIONS },
    ],
  },
}

export const PRACTICE_SECTION_TABS: ReadonlyArray<{ value: PracticeSection; label: string }> = [
  { value: 'NOUN', label: 'Существительные' },
  { value: 'VERB', label: 'Глаголы' },
  { value: 'ADJ', label: 'Прилагательные' },
]
