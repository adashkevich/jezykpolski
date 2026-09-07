/**
 * `PracticeScreenState` construction/merging helpers for `TrainingSetupScreen`
 * (`spec/tasks/19-practice-mode.md` §4/§5, `spec/tasks/36-practice-screen-restructure.md` §2,
 * FR-114/FR-150).
 *
 * Task 36 split the old single `PracticeConfig` (one section + one set of dimension/exercise-
 * type/count settings) into `PracticeScreenState`: a single section-less `LexicalWordFilter`
 * shared by the whole screen (feeds the "Выборка слов" preview and all three lexical drills),
 * plus one `PracticeFormsConfig` per `PracticeSection` (feeds that section's own forms block).
 * `practiceConfigFor` re-assembles the two into the `PracticeConfig` shape
 * `resolvePracticeCandidateWords`/`buildPracticeQueue`/`useSessionBootstrap.ts` already
 * consume unchanged — none of those three needed to change for this split.
 */
import type { WordQuery } from '@/content/query.ts'
import type { LexicalWordFilter } from '@/features/session-runner/lib/session-scope.ts'
import type { PracticeConfig, PracticeSection } from '@/learning/session/session.types.ts'
import type { WordStatus } from '@/types/progress.ts'
import { TRAINING_SECTIONS } from '../config/training-sections.ts'

/** Legacy key (task 19) — a single `PracticeConfig` for whichever section was last active.
 *  Task 36 replaces it with `PRACTICE_SCREEN_SETTING_KEY` below; kept here, read-only, purely
 *  as a one-time migration source (see `defaultPracticeScreenState`'s caller in
 *  `TrainingSetupScreen.tsx`) — nothing writes this key any more. */
export const PRACTICE_CONFIG_SETTING_KEY = 'lastPracticeConfig'

/** New key (task 36) the whole screen's state — `LexicalWordFilter` + all three sections'
 *  `PracticeFormsConfig` — is persisted under. */
export const PRACTICE_SCREEN_SETTING_KEY = 'practiceScreenState'

/** Sensible defaults for a from-scratch state — no incoming filter, no saved settings row yet
 *  (first-ever visit to `/practice`). Mirrors `spec/app-design.md` §23's own mockup ("Новые +
 *  изучаемые") rather than an unfiltered "Все". */
const DEFAULT_STATUS: readonly WordStatus[] = ['new', 'learning']
const DEFAULT_TARGET_SIZE = 20

export const DEFAULT_LEXICAL_FILTER: LexicalWordFilter = {
  upToLevel: null,
  status: DEFAULT_STATUS,
  topN: null,
}

/** The per-section settings a forms-training block owns (`spec/tasks/36-…md` §2) — every
 *  `PracticeConfig` field except `section` and the lexical filter fields, which now live on
 *  `PracticeScreenState` itself. */
export type PracticeFormsConfig = Pick<
  PracticeConfig,
  'includeTranslation' | 'dimensionSelection' | 'exerciseTypes' | 'targetSize'
>

export interface PracticeScreenState {
  readonly filter: LexicalWordFilter
  readonly formsBySection: Readonly<Record<PracticeSection, PracticeFormsConfig>>
}

export function defaultFormsConfigForSection(section: PracticeSection): PracticeFormsConfig {
  const definition = TRAINING_SECTIONS[section]
  const dimensionSelection: Record<string, string[]> = {}
  for (const group of definition.dimensionGroups) {
    dimensionSelection[group.key] = group.options.filter((o) => o.defaultOn).map((o) => o.value)
  }
  return {
    includeTranslation: true,
    dimensionSelection,
    exerciseTypes: { choice: true, input: true },
    targetSize: DEFAULT_TARGET_SIZE,
  }
}

export function defaultPracticeScreenState(): PracticeScreenState {
  return {
    filter: DEFAULT_LEXICAL_FILTER,
    formsBySection: {
      NOUN: defaultFormsConfigForSection('NOUN'),
      VERB: defaultFormsConfigForSection('VERB'),
      ADJ: defaultFormsConfigForSection('ADJ'),
    },
  }
}

/**
 * One-time migration (task 36 §2) from the legacy single-section `PracticeConfig` (`settings`
 * key `lastPracticeConfig`) to `PracticeScreenState`: `saved`'s level/status/frequency seed the
 * new shared `filter`, and `saved`'s own dimension/exercise-type/count settings seed
 * `formsBySection[saved.section]` — the other two sections start at their own defaults, same
 * as a from-scratch state. Called at most once per install; `TrainingSetupScreen` never writes
 * `lastPracticeConfig` again afterwards, so this function only ever sees `saved` on the very
 * first `/practice` visit after upgrading.
 */
export function migrateLegacyPracticeConfig(saved: PracticeConfig): PracticeScreenState {
  const base = defaultPracticeScreenState()
  return {
    filter: {
      upToLevel: saved.upToLevel,
      status: saved.status,
      topN: saved.topN,
    },
    formsBySection: {
      ...base.formsBySection,
      [saved.section]: {
        includeTranslation: saved.includeTranslation,
        dimensionSelection: saved.dimensionSelection,
        exerciseTypes: saved.exerciseTypes,
        targetSize: saved.targetSize,
      },
    },
  }
}

/** Assembles the `PracticeConfig` a given section's forms block needs to launch — the shape
 *  `resolvePracticeCandidateWords`/`buildPracticeQueue`/`useSessionBootstrap.ts` already
 *  consume, untouched by task 36. */
export function practiceConfigFor(state: PracticeScreenState, section: PracticeSection): PracticeConfig {
  const forms = state.formsBySection[section]
  return {
    section,
    upToLevel: state.filter.upToLevel,
    status: state.filter.status,
    topN: state.filter.topN,
    includeTranslation: forms.includeTranslation,
    dimensionSelection: forms.dimensionSelection,
    exerciseTypes: forms.exerciseTypes,
    targetSize: forms.targetSize,
  }
}

/** `filter.pos` narrowed to one of the three sections this screen has a forms block for —
 *  `undefined` for no filter, "Все" (no `pos` at all), multiple POS at once, `ADV`, or
 *  anything else. Task 36 repurposes this: an incoming `/words` filter with exactly one
 *  section no longer selects a tab (the tabs are gone) — it picks which forms block
 *  `TrainingSetupScreen` opens by default instead. */
export function sectionFromFilterPos(pos: WordQuery['pos'] | undefined): PracticeSection | undefined {
  if (!pos || pos.length !== 1) return undefined
  const candidate = pos[0]
  return candidate === 'NOUN' || candidate === 'VERB' || candidate === 'ADJ' ? candidate : undefined
}

/**
 * Overlays `filter`'s level/status/frequency onto `state.filter` (task 19 text step 5 /
 * task 36 §2 — same "приоритетнее сохранённой конфигурации" precedence, now against the
 * screen-wide filter instead of one section's `PracticeConfig`). `formsBySection` is left
 * untouched.
 */
export function applyIncomingFilter(state: PracticeScreenState, filter: WordQuery): PracticeScreenState {
  return {
    ...state,
    filter: {
      upToLevel: filter.upToLevel ?? state.filter.upToLevel,
      status: filter.status && filter.status.length > 0 ? [...filter.status] : state.filter.status,
      topN: filter.topN !== undefined ? filter.topN : state.filter.topN,
    },
  }
}
