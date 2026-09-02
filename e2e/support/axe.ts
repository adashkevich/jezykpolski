/**
 * Shared `axe-core` runner for the accessibility scan (`spec/tasks/26-quality-a11y-e2e.md`
 * §1: "Проверить `axe` на каждом основном экране").
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Runs the default axe ruleset (WCAG 2.0/2.1 A+AA + best-practice) against the whole page
 *  and asserts zero violations, failing with the full violation list (rule id, impact,
 *  affected selectors, help text) inlined into the assertion message — Playwright's own
 *  failure output is the report here, no separate artifact needed for an agent-driven run. */
export async function expectNoAxeViolations(page: Page, screenLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }))
  expect(summary, `axe violations on ${screenLabel}:\n${JSON.stringify(summary, null, 2)}`).toEqual(
    [],
  )
}

/**
 * Switches the page to dark theme via `prefers-color-scheme` emulation, NOT by directly
 * toggling the `.dark` class on `<html>`.
 *
 * FOUND DURING THIS TASK'S OWN a11y PASS: a first version of this helper called
 * `document.documentElement.classList.add('dark')` directly. That is silently undone —
 * every failing test that used it was actually still scanning the LIGHT theme, confirmed by
 * comparing the axe-reported colors (`#737373`/`#f5f5f5`, the light tokens) against what the
 * real dark tokens render as. The cause: `THEME_SETTING_KEY` defaults to `'system'`
 * (`features/settings/lib/theme.ts`), and `useThemeSync.ts` — mounted app-wide in
 * `AppProviders.tsx` — re-applies whatever `applyTheme(preference)` that setting resolves to
 * on every render once its `useLiveQuery` settles; for the untouched `'system'` default,
 * `applyTheme` removes both `.dark`/`.light` (see that function's own header), which fires
 * shortly after this helper's one-time class toggle and reverts it. Emulating the OS-level
 * media feature instead is what `globals.css`'s own `@media (prefers-color-scheme: dark) {
 * :root:not(.light) {...} }` block is built to respond to — the same mechanism a real user
 * with a dark-mode OS and this app's default settings would hit, and nothing in the app ever
 * fights a media-query match the way it fights a manually-toggled class. Call this BEFORE
 * `page.goto` so the very first paint already renders dark, matching what a real "OS already
 * dark" visit looks like (Playwright's `emulateMedia` still applies correctly if called
 * after navigation too — CSS media features are live — but "before" is what every call site
 * in this suite uses and is the least surprising order).
 */
export async function setDarkTheme(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' })
}
