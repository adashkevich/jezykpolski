/**
 * `PracticeConfig` construction/merging helpers for `TrainingSetupScreen`
 * (`spec/tasks/19-practice-mode.md` §4/§5, FR-114).
 *
 * Two responsibilities, both plain data transforms (no React, but this still lives under
 * `features/**` rather than `learning/**` — it reads `content/query.ts#WordQuery`, a
 * content-layer type `learning/**` must not depend on):
 *
 *  1. `defaultConfigForSection` — a fresh `PracticeConfig` for a section, with every
 *     dimension checkbox at its `TrainingDimensionGroup.defaultOn` value.
 *  2. `applyIncomingFilter` — task text step 5 / acceptance point 8: when `LearnFab.tsx`
 *     sends the current `/words` filter along, its level/status/frequency (and the section
 *     itself, from `filter.pos`) win over whatever the config would otherwise have; every
 *     other field (dimension selection, exercise types, task count) is untouched.
 */
import type { WordQuery } from '@/content/query.ts'
import type { PracticeConfig, PracticeSection } from '@/learning/session/session.types.ts'
import type { WordStatus } from '@/types/progress.ts'
import { TRAINING_SECTIONS } from '../config/training-sections.ts'

export const PRACTICE_CONFIG_SETTING_KEY = 'lastPracticeConfig'

/** Sensible defaults for a from-scratch config — no incoming filter, no saved settings row
 *  yet (first-ever visit to `/practice`). Mirrors `spec/app-design.md` §23's own mockup
 *  ("Новые + изучаемые") rather than an unfiltered "Все". */
const DEFAULT_STATUS: readonly WordStatus[] = ['new', 'learning']
const DEFAULT_TARGET_SIZE = 20

export function defaultConfigForSection(section: PracticeSection): PracticeConfig {
  const definition = TRAINING_SECTIONS[section]
  const dimensionSelection: Record<string, string[]> = {}
  for (const group of definition.dimensionGroups) {
    dimensionSelection[group.key] = group.options.filter((o) => o.defaultOn).map((o) => o.value)
  }
  return {
    section,
    upToLevel: null,
    status: DEFAULT_STATUS,
    topN: null,
    includeTranslation: true,
    dimensionSelection,
    exerciseTypes: { choice: true, input: true },
    targetSize: DEFAULT_TARGET_SIZE,
  }
}

/** `filter.pos` narrowed to one of the three sections this screen supports — `undefined` for
 *  no filter, "Все" (no `pos` at all), multiple POS at once, `ADV`, or anything else this
 *  screen has no section for. Callers fall back to the saved/default section in that case. */
export function sectionFromFilterPos(pos: WordQuery['pos'] | undefined): PracticeSection | undefined {
  if (!pos || pos.length !== 1) return undefined
  const candidate = pos[0]
  return candidate === 'NOUN' || candidate === 'VERB' || candidate === 'ADJ' ? candidate : undefined
}

/**
 * Overlays `filter`'s level/status/frequency onto `config` (task text step 5: "приоритетнее
 * сохранённой конфигурации для соответствующих полей") — only the fields `filter` actually
 * specifies change; everything else (`config`'s own `section` — already resolved by the
 * caller via `sectionFromFilterPos` — dimension selection, exercise types, task count) is
 * left exactly as `config` already had it.
 */
export function applyIncomingFilter(config: PracticeConfig, filter: WordQuery): PracticeConfig {
  return {
    ...config,
    upToLevel: filter.upToLevel ?? config.upToLevel,
    status: filter.status && filter.status.length > 0 ? [...filter.status] : config.status,
    topN: filter.topN !== undefined ? filter.topN : config.topN,
  }
}
