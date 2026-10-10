/**
 * First-run language screen E2E (`spec/tasks/52-language-onboarding.md`): the screen stands in
 * for the app on a fresh browser profile, the answer lands in `settings.langProfile`, and the
 * screen never comes back.
 *
 * Imports `test` straight from `@playwright/test`, not `./support/test.ts` — that wrapper
 * answers the screen after every `goto`, and this file is about the screen itself.
 */
import { expect, test, type Page } from '@playwright/test'
import { dbGetByKeys, STORE } from './support/db.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { LANG_SCREEN_HEADING } from './support/lang-onboarding.ts'

interface SettingRow {
  key: string
  value: unknown
}

async function storedLangs(page: Page): Promise<unknown> {
  const [row] = await dbGetByKeys<SettingRow>(page, STORE.settings, ['langProfile'])
  return row?.value
}

const ru = (page: Page) => page.getByRole('checkbox', { name: 'Знаю русский' })
const by = (page: Page) => page.getByRole('checkbox', { name: 'Знаю беларуский' })
const ua = (page: Page) => page.getByRole('checkbox', { name: 'Знаю украинский' })
const next = (page: Page) => page.getByRole('button', { name: 'Продолжить' })

test.describe('first-run language screen', () => {
  test('a fresh start shows three «Знаю …» cards with flags instead of the app, Russian ticked, nothing stored yet', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await expect(ru(page)).toBeChecked()
    await expect(by(page)).not.toBeChecked()
    await expect(ua(page)).not.toBeChecked()
    for (const flag of ['ru', 'bcb', 'ua']) {
      await expect(page.locator(`svg[data-flag="${flag}"]`)).toBeVisible()
    }
    // The wording the product asks for.
    await expect(page.getByText('Знаю беларуский')).toBeVisible()
    await expect(page.getByText(/белорус/i)).toHaveCount(0)
    // The app is not rendered behind the screen.
    await expect(page.getByRole('link', { name: 'Polski' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0)
    expect(await storedLangs(page)).toBeUndefined()
  })

  test('draws Russia as white-blue-white: the bottom stripe is white', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('svg[data-flag="ru"]')).toBeVisible()

    const fills = await page
      .locator('svg[data-flag="ru"] rect[data-stripe]')
      .evaluateAll((rects) => rects.map((rect) => rect.getAttribute('fill')))
    expect(fills).toEqual(['#ffffff', '#0039a6', '#ffffff'])
  })

  test('has no axe violations, as it opens and with several languages ticked', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()
    await expectNoAxeViolations(page, 'first-run language screen')

    await by(page).check({ force: true })
    await ua(page).check({ force: true })
    await expectNoAxeViolations(page, 'first-run language screen, three ticked')

    // And with nothing ticked: the locked button and the hint.
    await ru(page).uncheck({ force: true })
    await by(page).uncheck({ force: true })
    await ua(page).uncheck({ force: true })
    await expect(page.getByText('Отметьте хотя бы один язык.')).toBeVisible()
    await expectNoAxeViolations(page, 'first-run language screen, nothing ticked')
  })

  test('Russian + Belarusian: stores both, opens the app, and the screen does not return after a reload', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(next(page)).toBeEnabled()

    await by(page).check({ force: true })
    await next(page).click()

    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Знаю русский' })).toHaveCount(0)
    expect(await storedLangs(page)).toEqual(['ru', 'by'])

    await page.reload()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expect(page.getByRole('group', { name: LANG_SCREEN_HEADING })).toHaveCount(0)

    // Same answer is what the settings show.
    await page.goto('/settings')
    const group = page.getByRole('group', { name: 'Языки, которые я знаю' })
    await expect(group.getByRole('checkbox', { name: 'Знаю русский' })).toBeChecked()
    await expect(group.getByRole('checkbox', { name: 'Знаю беларуский' })).toBeChecked()
    await expect(group.getByRole('checkbox', { name: 'Знаю украинский' })).not.toBeChecked()
  })

  test('Russian can be un-ticked: Ukrainian alone is stored as it is', async ({ page }) => {
    await page.goto('/')

    await ua(page).check({ force: true })
    await ru(page).uncheck({ force: true })
    await expect(ru(page)).not.toBeChecked()
    await next(page).click()

    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    expect(await storedLangs(page)).toEqual(['ua'])

    await page.reload()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
  })

  test('with nothing ticked «Продолжить» is locked and the hint says why', async ({ page }) => {
    await page.goto('/')

    await ru(page).uncheck({ force: true })
    await expect(next(page)).toBeDisabled()
    await expect(page.getByText('Отметьте хотя бы один язык.')).toBeVisible()
    expect(await storedLangs(page)).toBeUndefined()

    await by(page).check({ force: true })
    await expect(next(page)).toBeEnabled()
  })

  test('Russian only as it opens: «Продолжить» stores ["ru"] — the answer, not the absence of one', async ({
    page,
  }) => {
    await page.goto('/')

    await next(page).click()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    expect(await storedLangs(page)).toEqual(['ru'])

    await page.reload()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
  })

  test('a deep link survives the screen: /words opens after the answer', async ({ page }) => {
    await page.goto('/words')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()

    await next(page).click()

    await expect(page).toHaveURL(/\/words$/)
    await expect(page.getByText(/^Найдено \d/)).toBeVisible()
  })

  test('Keyboard only: Tab to a card, Space ticks it, Enter confirms', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()

    await page.keyboard.press('Tab') // Знаю русский
    await page.keyboard.press('Tab') // Знаю беларуский
    await page.keyboard.press('Space')
    await expect(by(page)).toBeChecked()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    expect(await storedLangs(page)).toEqual(['ru', 'by'])
  })
})
