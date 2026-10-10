/**
 * The first-run language screen (`spec/tasks/52-language-onboarding.md`) as an E2E helper.
 *
 * Every scenario starts on an empty IndexedDB, so the first page load lands on the language
 * screen instead of the app. `passLangOnboarding` waits for whichever of the two shows up —
 * the screen's radio group or the app shell's brand link — and, if it was the screen, answers
 * it with «Русский» (the `ru` profile, the same one the app used before the screen existed, so
 * the existing scenarios keep exercising exactly what they did). If the shell is already there
 * (the answer is stored) it does nothing.
 */
import type { Page } from '@playwright/test'

export const LANG_SCREEN_HEADING = 'Какой язык вы знаете?'

export async function passLangOnboarding(page: Page): Promise<void> {
  const screen = page.getByRole('radiogroup', { name: LANG_SCREEN_HEADING })
  const shell = page.getByRole('link', { name: 'Polski' })

  await screen.or(shell).first().waitFor()
  if (!(await screen.isVisible())) return

  await page.getByRole('radio', { name: /Русский/ }).check({ force: true })
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await shell.waitFor()
}
