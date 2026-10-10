/**
 * First-run language screen E2E (`spec/tasks/52-language-onboarding.md`): the screen stands in
 * for the app on a fresh browser profile, the answer lands in `settings.langProfile`, and the
 * screen never comes back.
 *
 * Imports `test` straight from `@playwright/test`, not `./support/test.ts` — that wrapper
 * answers the screen after every `goto`, and this file is about the screen itself.
 */
import { expect, test } from '@playwright/test'
import { dbGetByKeys, STORE } from './support/db.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { LANG_SCREEN_HEADING } from './support/lang-onboarding.ts'

interface SettingRow {
  key: string
  value: unknown
}

async function storedLangProfile(page: import('@playwright/test').Page): Promise<unknown> {
  const [row] = await dbGetByKeys<SettingRow>(page, STORE.settings, ['langProfile'])
  return row?.value
}

test.describe('first-run language screen', () => {
  test('a fresh start shows the two flags instead of the app, and nothing is stored yet', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(2)
    await expect(page.locator('svg[data-flag="ru"]')).toBeVisible()
    await expect(page.locator('svg[data-flag="bcb"]')).toBeVisible()
    // The app is not rendered behind the screen.
    await expect(page.getByRole('link', { name: 'Polski' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0)
    expect(await storedLangProfile(page)).toBeUndefined()
  })

  test('has no axe violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()
    // And once a card is picked (selected state: tinted card + filled radio).
    await page.getByRole('radio', { name: /Белорусский/ }).check({ force: true })
    await expectNoAxeViolations(page, 'first-run language screen')
  })

  test('Belarusian: stores "by", opens the app, and the screen does not return after a reload', async ({
    page,
  }) => {
    await page.goto('/')
    const next = page.getByRole('button', { name: 'Продолжить' })
    await expect(next).toBeDisabled()

    await page.getByRole('radio', { name: /Белорусский/ }).check({ force: true })
    await expect(next).toBeEnabled()
    await next.click()

    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expect(page.getByRole('radiogroup')).toHaveCount(0)
    expect(await storedLangProfile(page)).toBe('by')

    await page.reload()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expect(page.getByRole('radiogroup')).toHaveCount(0)

    // Same answer is what the settings select shows (task 51's "Русский и белорусский").
    await page.goto('/settings')
    await expect(page.getByRole('combobox', { name: 'Языки, которые я знаю' })).toHaveValue('by')
  })

  test('Russian: stores "ru" explicitly, and the choice is single — picking the other card moves it', async ({
    page,
  }) => {
    await page.goto('/')

    const ru = page.getByRole('radio', { name: /Русский/ })
    const by = page.getByRole('radio', { name: /Белорусский/ })
    await by.check({ force: true })
    await ru.check({ force: true })
    await expect(ru).toBeChecked()
    await expect(by).not.toBeChecked()

    await page.getByRole('button', { name: 'Продолжить' }).click()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    expect(await storedLangProfile(page)).toBe('ru')

    await page.reload()
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
  })

  test('a deep link survives the screen: /words opens after the answer', async ({ page }) => {
    await page.goto('/words')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()

    await page.getByRole('radio', { name: /Русский/ }).check({ force: true })
    await page.getByRole('button', { name: 'Продолжить' }).click()

    await expect(page).toHaveURL(/\/words$/)
    await expect(page.getByText(/^Найдено \d/)).toBeVisible()
  })

  test('Keyboard only: arrows move the selection, Enter confirms', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: LANG_SCREEN_HEADING })).toBeVisible()

    await page.keyboard.press('Tab')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: /Белорусский/ })).toBeChecked()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    expect(await storedLangProfile(page)).toBe('by')
  })
})
