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
