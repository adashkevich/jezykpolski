/**
 * Playwright `test` for every scenario that is NOT about the first-run language screen
 * (`spec/tasks/52-language-onboarding.md` §4).
 *
 * A fresh browser profile has no stored `langProfile`, so each scenario's first `page.goto`
 * would stop on the language screen. This `test` wraps `page.goto`: once the navigation is done
 * it calls {@link passLangOnboarding}, which answers the screen if it is up and is a no-op when
 * the app is already open (any later `goto` in the same test, a stored answer). Scenarios keep
 * their own flow unchanged — only the import differs.
 *
 * `e2e/lang-onboarding.spec.ts` deliberately imports from `@playwright/test` instead: it is the
 * one place that must see the raw screen.
 */
import { test as base } from '@playwright/test'
import { passLangOnboarding } from './lang-onboarding.ts'

export { expect } from '@playwright/test'

export const test = base.extend({
  // The fixture callback is Playwright's `use`; named `provide` here because
  // `react-hooks/rules-of-hooks` reads any call to a function called `use` as a React hook.
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page)
    page.goto = async (...args: Parameters<typeof page.goto>) => {
      const response = await goto(...args)
      await passLangOnboarding(page)
      return response
    }
    await provide(page)
  },
})
