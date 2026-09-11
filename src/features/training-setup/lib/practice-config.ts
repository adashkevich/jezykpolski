/**
 * `PracticeScreenState` construction/merging helpers for `TrainingSetupScreen`
 * (`spec/tasks/19-practice-mode.md` §4/§5, `spec/tasks/36-practice-screen-restructure.md` §2,
 * narrowed further by `spec/tasks/39-practice-current-level.md`, FR-114/FR-150).
 *
 * Task 36 split the old single `PracticeConfig` (one section + one set of dimension/exercise-
 * type/count settings) into `PracticeScreenState`: a shared level/status/frequency filter
 * ("Выборка слов") plus one `PracticeFormsConfig` per `PracticeSection` (feeds that section's
 * own forms block). Task 39 removed the shared filter entirely — the word pool for every
 * block, lexical or forms, is now the level gate's own current level
 * (`@/learning/session/level-gate.ts#practicePoolLevel`, read live via `useLevelGate`), not a
 * user-chosen filter — so `PracticeScreenState` is back down to just `formsBySection`.
 * `practiceConfigFor` re-assembles a section's forms config plus the current gate level into
 * the `PracticeConfig` shape `resolvePracticeCandidateWords`/`buildPracticeQueue`/
 * `useSessionBootstrap.ts` already consume, unchanged since task 36.
 */
import type { WordQuery } from '@/content/query.ts'
import type { PracticeConfig, PracticeSection } from '@/learning/session/session.types.ts'
import { TRAINING_SECTIONS } from '../config/training-sections.ts'

/** Legacy key (task 19) — a single `PracticeConfig` for whichever section was last active.
 *  Task 36 replaced it with `PRACTICE_SCREEN_SETTING_KEY` below; kept here, read-only, purely
 *  as a one-time migration source (see `defaultPracticeScreenState`'s caller in
 *  `TrainingSetupScreen.tsx`) — nothing writes this key any more. */
export const PRACTICE_CONFIG_SETTING_KEY = 'lastPracticeConfig'

/** State key (task 36) all three sections' `PracticeFormsConfig` are persisted under. A row
 *  saved before task 39 also carries a now-unused `filter` field — reading `.formsBySection`
 *  off it is unaffected, and the field is simply dropped the next time any "Начать" persists
 *  a fresh `PracticeScreenState` (same tolerate-then-drop shape task 36's own legacy-key
 *  migration below uses, just without a dedicated migration function). */
export const PRACTICE_SCREEN_SETTING_KEY = 'practiceScreenState'

const DEFAULT_TARGET_SIZE = 20

/** The per-section settings a forms-training block owns (`spec/tasks/36-…md` §2) — every
 *  `PracticeConfig` field except `section` and the level/status/frequency fields, which task
 *  39 removed from this screen's state entirely (see this file's header). */
export type PracticeFormsConfig = Pick<
  PracticeConfig,
  'includeTranslation' | 'dimensionSelection' | 'exerciseTypes' | 'targetSize'
>

export interface PracticeScreenState {
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
    formsBySection: {
      NOUN: defaultFormsConfigForSection('NOUN'),
      VERB: defaultFormsConfigForSection('VERB'),
      ADJ: defaultFormsConfigForSection('ADJ'),
    },
  }
}

/**
 * One-time migration (task 36 §2, narrowed by task 39) from the legacy single-section
 * `PracticeConfig` (`settings` key `lastPracticeConfig`) to `PracticeScreenState`: `saved`'s
 * own dimension/exercise-type/count settings seed `formsBySection[saved.section]` — the other
 * two sections start at their own defaults, same as a from-scratch state. `saved`'s
 * level/status/frequency fields are ignored (task 39 removed that filter; the pool is now
 * always the level gate's current level). Called at most once per install; `TrainingSetupScreen`
 * never writes `lastPracticeConfig` again afterwards, so this function only ever sees `saved`
 * on the very first `/practice` visit after upgrading.
 */
export function migrateLegacyPracticeConfig(saved: PracticeConfig): PracticeScreenState {
  const base = defaultPracticeScreenState()
  return {
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
 *  consume, untouched since task 36. `upToLevel` comes from the level gate
 *  (`useLevelGate().practiceLevel`), not from screen state (task 39) — `status`/`topN` are
 *  always "no filter" (`[]`/`null`), the same values `resolvePracticeCandidateWords` already
 *  treats as "match everything" (`config.status.length > 0 ? config.status : undefined`). */
export function practiceConfigFor(
  state: PracticeScreenState,
  section: PracticeSection,
  upToLevel: PracticeConfig['upToLevel'],
): PracticeConfig {
  const forms = state.formsBySection[section]
  return {
    section,
    upToLevel,
    status: [],
    topN: null,
    includeTranslation: forms.includeTranslation,
    dimensionSelection: forms.dimensionSelection,
    exerciseTypes: forms.exerciseTypes,
    targetSize: forms.targetSize,
  }
}

/** `filter.pos` narrowed to one of the three sections this screen has a forms block for —
 *  `undefined` for no filter, "Все" (no `pos` at all), multiple POS at once, `ADV`, or
 *  anything else. Task 36 repurposed this: an incoming `/words` filter with exactly one
 *  section no longer selects a tab (the tabs are gone) — it picks which forms block
 *  `TrainingSetupScreen` opens by default instead. Task 39 left this behavior as-is — the
 *  incoming filter's `pos` still picks the default-open block, only its level/status/
 *  frequency fields stopped being read (there is nowhere left on screen state to put them). */
export function sectionFromFilterPos(pos: WordQuery['pos'] | undefined): PracticeSection | undefined {
  if (!pos || pos.length !== 1) return undefined
  const candidate = pos[0]
  return candidate === 'NOUN' || candidate === 'VERB' || candidate === 'ADJ' ? candidate : undefined
}
