/**
 * Theme preference (`spec/tasks/24-settings-backup.md` §1: "Тема — системная / светлая /
 * тёмная"). Pure settings-key + DOM-class-application logic — no React, so it's reusable
 * from both the settings screen itself and the app-wide sync hook (`../hooks/useThemeSync.ts`)
 * that actually keeps the document in sync as the setting changes.
 *
 * `src/app/styles/globals.css`'s own header (written by task 06/07) already anticipates this
 * exact contract: "Task 24 owns the manual toggle (adding/removing `.dark`, and — forward-
 * compatible with that — a `.light` class to force light even when the system prefers dark)".
 * The three preferences map onto that CSS directly:
 *
 *  - `'system'`  — neither class present. `:root`'s plain light tokens apply, UNLESS the
 *                  `@media (prefers-color-scheme: dark) { :root:not(.light) { ... } }` block
 *                  overrides them — i.e. exactly "follow the OS", with zero JS involvement
 *                  once the class is (or stays) absent.
 *  - `'light'`   — `.light` added. Blocks that same media-query selector (`:not(.light)`),
 *                  so light tokens win even when the OS prefers dark.
 *  - `'dark'`    — `.dark` added. A plain top-level rule, unconditional — wins regardless of
 *                  OS preference, exactly like Tailwind's standard `.dark` convention.
 *
 * The two classes are mutually exclusive by construction (`applyTheme` always removes both
 * before adding at most one back), so there is no state where both are present.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

/** `settings` table key (`db/repositories/settings.repository.ts`). */
export const THEME_SETTING_KEY = 'theme'

export const THEME_DEFAULT: ThemePreference = 'system'

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
]

/** Applies `preference` to `document.documentElement` — see this file's header for exactly
 *  which CSS rule each of the three values engages. Safe to call from a non-DOM environment
 *  only insofar as callers already guard it (React effects only run client-side); this
 *  function itself assumes `document` exists. */
export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', preference === 'dark')
  root.classList.toggle('light', preference === 'light')
}
