/**
 * Task 34 (`spec/tasks/34-viewport-zoom-fix.md`) — regression coverage for the iOS Safari
 * auto-zoom bug at a real 320px mobile width (the task text's own reproduction width, and
 * the narrowest width this app supports per task 26's "Вёрстка корректна на 320px" checklist
 * item, which never got an automated check of its own — see this file's header note below).
 *
 * Two properties, both size-related but for different reasons:
 *
 *  1. Every focusable text control (`CONTROL_CLASS`, `src/components/ui/control.ts`) computes
 *     to a `font-size` of at least 16px at this width — the actual root cause fix (a control
 *     under 16px is what makes iOS Safari zoom the page in on focus and never zoom back out).
 *  2. `AppShell`'s one scroll container (`main`, `src/components/app/AppShell.tsx`) never
 *     grows a horizontal scrollbar at 320px on any of the screens below — part of the bug
 *     report's own symptom description is exactly this ("после автозума страница начинает
 *     скроллиться вбок"), so it's checked here as its own assertion, independent of theory
 *     about why: a regression here would look like the same symptom even with every font-size
 *     already fixed.
 *
 * This is the automated 320px check task 26's own text asked for but never got (there was no
 * `setViewportSize`/width-specific test anywhere in `e2e/` before this file) — added here
 * since task 34 explicitly calls for verifying it as part of this same fix.
 */
import { expect, type Page, test } from '@playwright/test'

const MOBILE_VIEWPORT = { width: 320, height: 640 }

async function expectNoHorizontalScroll(page: Page, screenLabel: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth }
  })
  expect(
    overflow.scrollWidth,
    `${screenLabel}: document.documentElement.scrollWidth (${overflow.scrollWidth}) exceeds ` +
      `clientWidth (${overflow.clientWidth}) at 320px — the page has grown a horizontal scrollbar.`,
  ).toBeLessThanOrEqual(overflow.clientWidth)
}

/** Focuses `locator` and asserts its own computed `font-size` is >= 16px — the exact
 *  condition iOS Safari's auto-zoom-on-focus keys off (task 34 §1). Reads a live computed
 *  style rather than inspecting class names, so it exercises the real cascade (Tailwind's
 *  `md:` breakpoint not applying at this 320px width included) instead of trusting that the
 *  intended classes are present. */
async function expectFocusedFontSizeAtLeast16(locator: ReturnType<Page['locator']>): Promise<void> {
  await locator.focus()
  const fontSize = await locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThanOrEqual(16)
}

test.describe('320px mobile viewport — no auto-zoom, no horizontal scroll', () => {
  test.use({ viewport: MOBILE_VIEWPORT })

  test('words list: search input, filter selects, level chips', async ({ page }) => {
    await page.goto('/words')
    await expect(page.getByText(/^Найдено \d/)).toBeVisible()
    await expectNoHorizontalScroll(page, '/words')

    await expectFocusedFontSizeAtLeast16(page.getByRole('searchbox'))

    await page.getByRole('button', { name: 'Фильтры' }).click()
    const statusSelect = page.getByRole('combobox', { name: 'Статус' })
    await expect(statusSelect).toBeVisible()
    await expectFocusedFontSizeAtLeast16(statusSelect)
  })

  test('settings: theme and learning selects', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expectNoHorizontalScroll(page, '/settings')

    await expectFocusedFontSizeAtLeast16(page.getByRole('combobox', { name: 'Тема' }))
    await expectFocusedFontSizeAtLeast16(
      page.getByRole('combobox', { name: 'Новых слов в день' }),
    )
  })

  test('practice setup: level/frequency selects', async ({ page }) => {
    await page.goto('/practice')
    await expect(page.getByRole('tablist', { name: 'Раздел' })).toBeVisible()
    await expectNoHorizontalScroll(page, '/practice')

    await expectFocusedFontSizeAtLeast16(page.getByRole('combobox', { name: 'Уровень' }))
    await expectFocusedFontSizeAtLeast16(page.getByRole('combobox', { name: 'Частотность' }))
  })

  test('table practice: NOUN declension cell input', async ({ page }) => {
    await page.goto('/words')
    await page.getByRole('searchbox').fill('kobieta')
    await page.getByRole('link', { name: /kobieta/ }).first().click()
    await page.getByRole('button', { name: 'Формы слова' }).click()
    await page.getByRole('button', { name: 'Тренировать таблицей' }).click()
    await expect(page).toHaveURL(/\/practice\/table\//)
    await expectNoHorizontalScroll(page, '/practice/table/:wordId')

    const firstCell = page.locator('table input[type="text"]').first()
    await expectFocusedFontSizeAtLeast16(firstCell)
  })

  test('home and word detail have no horizontal overflow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expectNoHorizontalScroll(page, '/')

    await page.goto('/words')
    await page.getByRole('searchbox').fill('kobieta')
    await page.getByRole('link', { name: /kobieta/ }).first().click()
    await expect(page).toHaveURL(/\/words\/kobieta/)
    await expectNoHorizontalScroll(page, '/words/:wordId')
  })
})
