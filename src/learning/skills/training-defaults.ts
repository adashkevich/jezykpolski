/**
 * Which dimensions the training queue introduces by default (`spec/tasks/17-nouns-section.md`
 * §6, `spec/app-design.md` §9, FR-02).
 *
 * Wołacz (the vocative case) is grammatically real and stays fully visible/clickable in
 * `NounFormsTable` (task 17 §6: "доступен в таблице и включаем вручную") — this module is
 * only about what a *queue builder* should introduce on its own, before the user has opted
 * in. No queue builder for morphological skills exists yet (task 18's noun-forms exercises,
 * task 19's Practice setup screen — see `spec/tasks/17-nouns-section.md`'s own scope note:
 * this task deliberately does not touch `build-learn-queue.ts`, which today only ever sees
 * `vocab:*` skills), so this file has no caller within task 17 itself. It exists now so both
 * of those later tasks share one rule instead of each inventing their own vocative check.
 *
 * Two pieces, deliberately split:
 *  - `isDimensionTrainedByDefault` — pure predicate, no I/O, lives here as the "pure domain
 *    layer" `learning/**` is throughout (architecture.md §3: no React, no Dexie).
 *  - The persisted toggle itself (`includeVocativeInTraining`) is NOT wrapped in a
 *    getter/setter here, on purpose: `features/session-runner/lib/session-scope.ts` already
 *    established the house convention for a settings-repository-backed flag with a fallback
 *    default — a bare exported `*_SETTING_KEY` + `*_DEFAULT` pair, read directly at the call
 *    site via `settingsRepo.get(KEY, DEFAULT)` (see that file's `DEFAULT_TARGET_SIZE_KEY` /
 *    `DEFAULT_NEW_WORDS_BUDGET_KEY`). Repeating that here — rather than adding a Dexie-backed
 *    read function to this file — keeps this module importable from `learning/**` without
 *    tripping the `no-restricted-imports` Dexie ban (`eslint.config.js`), and keeps exactly
 *    one convention for "a settings-backed default with a fallback" in the codebase.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { Dimension } from './dimensions.ts'

/** `settings` table key (`db/repositories/settings.repository.ts`) for whether Wołacz should
 *  be introduced by a training queue without the user explicitly opting in. */
export const INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY = 'includeVocativeInTraining'

/** Wołacz is rare and outside the base course (task text §6) — off until the user turns it
 *  on, either in the future Practice-setup screen (task 19) or the noun-exercise queue
 *  (task 18) reading this same flag. */
export const INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT = false

/**
 * Whether `dimension` should be introduced by a training queue without the user explicitly
 * asking for it. `false` for every `noun:<sg|pl>:vocative` slot; `true` for everything else
 * (every other case, every VERB/ADJ/ADV dimension, both `vocab:*` skills) — task 17 §6's
 * exclusion is specific to the vocative case, nothing else.
 */
export function isDimensionTrainedByDefault(dimension: Dimension): boolean {
  return !(dimension.startsWith('noun:') && dimension.endsWith(':vocative'))
}
