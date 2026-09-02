/**
 * The noun form-exercise "подсказка" setting (`spec/tasks/18-noun-exercises.md` steps 1-2,
 * `spec/app-design.md` §9: "◉ показать польскую лемму / ○ показать русский перевод / ○
 * случайно").
 *
 * `generate.ts`'s `buildFormInput`/`buildFormChoice` already carry both fields a form
 * exercise ever needs (`lemma`, the Polish citation form; `hint`, the primary translation) —
 * this module only decides which of the two is `PromptMode` for a given generated exercise.
 * "Same skill, different prompt" (task text step 2: "Это тот же навык, но с другой
 * подсказкой — не отдельный skillId, а параметр `hintMode` упражнения") is why this lives
 * next to `generate.ts` rather than as a second dimension namespace entry.
 *
 * `'random'` is resolved deterministically from the same `seed` `generate.ts` already
 * threads through every other seed-dependent choice (distractor set, correct-answer
 * position) — never `Math.random()`, for the same determinism reason `generate.ts`'s own
 * header gives: a re-render of the same question must show the same prompt mode, and tests
 * must be reproducible.
 *
 * The persisted setting itself follows the house convention `session-scope.ts` established
 * for a settings-repository-backed flag with a fallback default: a bare exported
 * `*_SETTING_KEY` + `*_DEFAULT` pair, read directly at the call site via
 * `settingsRepo.get(KEY, DEFAULT)` — never a getter/setter wrapper here, which would pull
 * Dexie into this pure `learning/**` module (banned by `eslint.config.js`'s
 * `no-restricted-imports` for this directory).
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { PromptMode } from './exercise.types.ts'

/** `'lemma'` / `'translation'` are `PromptMode` itself; `'random'` means "pick one of the
 *  two, deterministically, per exercise". */
export type HintMode = PromptMode | 'random'

/** `settings` table key (`db/repositories/settings.repository.ts`) for the noun
 *  form-exercise hint mode. */
export const NOUN_HINT_MODE_SETTING_KEY = 'nounHintMode'

/** Matches app-design §9's mockup, where "показать польскую лемму" is the pre-selected
 *  radio (`◉`) — Wariant A (FR-60) is the default, not the harder Wariant B (FR-61). */
export const NOUN_HINT_MODE_DEFAULT: HintMode = 'lemma'

/**
 * Resolves a `HintMode` setting value to the concrete `PromptMode` one exercise instance
 * should use. `'lemma'`/`'translation'` pass through unchanged; `'random'` picks between them
 * based on the exercise's own `seed` (even/odd) — different seeds (task 10 §3: "Seed = хэш
 * от skillId + reps") land on different prompt modes across attempts, while the *same* seed
 * (a re-render of the same question) always resolves the same way.
 */
export function resolvePromptMode(hintMode: HintMode, seed: number): PromptMode {
  if (hintMode !== 'random') return hintMode
  return Math.abs(seed) % 2 === 0 ? 'lemma' : 'translation'
}
