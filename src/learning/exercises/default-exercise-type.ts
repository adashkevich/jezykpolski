/**
 * The Learn queue's "Тип задания по умолчанию" setting (`spec/tasks/24-settings-backup.md`
 * §1's mockup: "выбор + ввод"). Not required by any earlier task — before task 24, only
 * Practice (`features/training-setup/**`, task 19) let the user restrict a session to just
 * recognition (`choice`/`form-choice`) or recall (`input`/`form-input`) exercises, via its
 * own per-run `PracticeConfig.exerciseTypes`. This module is the equivalent *global default*
 * for every other scope (`session-scope.ts`'s `word`/`filter`/`global`/`mistake`/`skill`
 * kinds — everything `useSessionBootstrap.ts` calls "Learn-like"), read once per session
 * bootstrap the same way `hint-mode.ts`'s `nounHintMode` already is.
 *
 * `resolveForceCategory` is the exact same two-checkbox -> `ExerciseCategory | undefined`
 * mapping `useSessionBootstrap.ts` already had inlined as a private `forceCategoryFor`
 * helper for the Practice branch — pulled out here so both branches (Practice's per-run
 * config and every other scope's persisted default) share one rule instead of two copies
 * that could drift. `undefined` (both checked, or defensively neither) leaves
 * `picker.ts#pickExerciseType`'s normal SRS-state-driven choice in charge — exactly today's
 * pre-task-24 behavior for every non-Practice scope, which is why `{ choice: true, input:
 * true }` is the default: an app that has never seen this settings screen keeps behaving
 * exactly as it did before this task existed.
 *
 * The persisted setting itself follows the house convention (`session-scope.ts`'s own
 * `DEFAULT_TARGET_SIZE_KEY` / `hint-mode.ts`'s `NOUN_HINT_MODE_SETTING_KEY`): a bare exported
 * `*_SETTING_KEY` + `*_DEFAULT` pair, read directly at the call site via
 * `settingsRepo.get(KEY, DEFAULT)` — no getter/setter wrapper, which would pull Dexie into
 * this pure `learning/**` module (banned by `eslint.config.js`'s `no-restricted-imports`).
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { ExerciseCategory } from './picker.ts'

export interface ExerciseTypeSelection {
  readonly choice: boolean
  readonly input: boolean
}

/** `settings` table key (`db/repositories/settings.repository.ts`) for the Learn queue's
 *  default exercise-type restriction. */
export const DEFAULT_EXERCISE_TYPES_SETTING_KEY = 'defaultExerciseTypes'

/** Both checked ("выбор + ввод", the task text's own mockup default) — no restriction,
 *  `resolveForceCategory` of this value is `undefined`. */
export const DEFAULT_EXERCISE_TYPES_DEFAULT: ExerciseTypeSelection = { choice: true, input: true }

/**
 * Exactly one of `choice`/`input` checked forces every exercise in the session to that
 * recognition/recall category (`picker.ts`'s `PickerOptions.forceCategory`); both checked —
 * or, defensively, neither — leaves the state-based picker in charge.
 */
export function resolveForceCategory(
  selection: ExerciseTypeSelection,
): ExerciseCategory | undefined {
  if (selection.choice && !selection.input) return 'recognition'
  if (selection.input && !selection.choice) return 'recall'
  return undefined
}
