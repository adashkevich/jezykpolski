/**
 * Automated `axe-core` accessibility scan (`spec/tasks/26-quality-a11y-e2e.md` §1: "Проверить
 * `axe` на каждом основном экране") — the automated half of the task's a11y checklist. The
 * checklist items `axe` cannot verify at all (keyboard tab *order*, `prefers-reduced-motion`
 * actually disabling animation) are covered separately by the manual code-level pass
 * documented in this task's final report. The app ships a single light theme, so the scans
 * below cover contrast for every theme there is.
 *
 * Each of the app's 12 main screens gets its own `test()` so a failure names exactly which
 * screen regressed, even though several screens require real navigation (not a bare `goto`)
 * to reach a meaningful, data-populated state: `/words/:wordId`,
 * `/practice/table/:wordId`, `/practice/verb-table/:wordId/:tense` need a real word (searched
 * for by lemma — see file body for why not "whichever row sorts first" — 14 of 7998 words
 * have no paradigm at all, `data/inflections.json`'s own documented gap, and several of
 * those happen to be very-high-frequency pronouns tagged NOUN in this corpus); `/session` and
 * `/session/result` need a real (brief) Learn session in progress/finished.
 */
import { expect, test } from '@playwright/test'
import { answerChoiceExercise } from './support/exercise.ts'
import { expectNoAxeViolations } from './support/axe.ts'
import { openTrainingBlock } from './support/training.ts'

test.describe('accessibility (axe) — light theme, real screens', () => {
  test('home (/)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expectNoAxeViolations(page, '/')
  })

  test('words list (/words)', async ({ page }) => {
    await page.goto('/words')
    await expect(page.getByText(/^Найдено \d/)).toBeVisible()
    await expectNoAxeViolations(page, '/words')
  })

  test('word detail (/words/:wordId)', async ({ page }) => {
    await page.goto('/words')
    await page.getByRole('searchbox').fill('kobieta')
    await page.getByRole('link', { name: /kobieta/ }).first().click()
    await expect(page).toHaveURL(/\/words\/kobieta/)
    await expect(page.getByRole('heading', { name: 'kobieta', level: 1 })).toBeVisible()
    await expectNoAxeViolations(page, '/words/:wordId')
  })

  test('nouns/verbs/adjectives stub sections', async ({ page }) => {
    for (const path of ['/nouns', '/verbs', '/adjectives']) {
      await page.goto(path)
      // Waits past the same pre-hydration flash every other test in this file guards
      // against — a bare `goto` + immediate scan can catch the app mid-mount.
      await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
      await expectNoAxeViolations(page, path)
    }
  })

  test('session runner (/session) and results (/session/result)', async ({ page }) => {
    await page.goto('/settings')
    const inputCheckbox = page.getByRole('checkbox', { name: 'Ввод' })
    if (await inputCheckbox.isChecked()) await inputCheckbox.click()

    await page.goto('/')
    await page.getByRole('button', { name: /обучение|слова/i }).click()
    await expect(page).toHaveURL(/\/session$/)
    await expect(page.getByRole('radiogroup', { name: 'Варианты ответа' })).toBeVisible()
    await expectNoAxeViolations(page, '/session (question)')

    // Answer once more so the feedback banner (`role="status"`/`aria-live="polite"`,
    // NFR-11's non-color correct/incorrect distinction) is on screen for the scan too.
    await page.getByRole('radiogroup', { name: 'Варианты ответа' }).getByRole('radio').first().click()
    await expect(page.getByRole('status').filter({ hasText: /Верно!|Неверно|Почти/ })).toBeVisible()
    // `ExerciseFeedback.tsx`'s entrance animation (`motion-safe:fade-in`, 200ms) is still
    // mid-transition immediately after the banner becomes visible — its text renders at
    // partial opacity for that first fraction of a second, which axe's `color-contrast` rule
    // (correctly) flags against the mid-fade blended color. Waiting past the animation's own
    // duration scans the actual steady-state colors a user reads, not one busy frame of a
    // 200ms transition.
    await page.waitForTimeout(300)
    await expectNoAxeViolations(page, '/session (feedback)')
    await page.getByRole('button', { name: 'Далее' }).click()

    await answerChoiceExercise(page)
    await page.getByRole('button', { name: 'Выйти из сессии' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти' }).click()
    await expect(page).toHaveURL(/\/session\/result$/)
    await expectNoAxeViolations(page, '/session/result')
  })

  test('practice setup (/practice)', async ({ page }) => {
    await page.goto('/practice')
    // Task 36 (`spec/tasks/36-practice-screen-restructure.md` §1/§3) removed the "Раздел"
    // tabs — the 3 lexical drills are POS-independent now, and their "Начать" is visible
    // immediately (no disclosure at all for those 3 blocks).
    await expect(page.getByRole('button', { name: 'Начать: сопоставление' })).toBeVisible()
    // The scan must pass with every forms block collapsed (the screen's default) AND with one
    // expanded (collapsed controls must never reach the axe scan either, but the expanded
    // state is the one with the most controls on screen at once) — same task 32
    // acceptance criterion, now checked against one of task 36's 3 per-section forms blocks.
    await expectNoAxeViolations(page, '/practice (collapsed)')

    await openTrainingBlock(page, 'Формы существительных')
    await expect(
      page.getByRole('button', { name: 'Начать: тренировку форм существительных' }),
    ).toBeVisible()
    await expectNoAxeViolations(page, '/practice (forms configurator expanded)')
  })

  test('table practice (/practice/table/:wordId)', async ({ page }) => {
    await page.goto('/words')
    await page.getByRole('searchbox').fill('kobieta')
    await page.getByRole('link', { name: /kobieta/ }).first().click()
    await page.getByRole('button', { name: 'Формы слова' }).click()
    await page.getByRole('button', { name: 'Тренировать таблицей' }).click()
    await expect(page).toHaveURL(/\/practice\/table\//)
    await expect(page.getByRole('heading', { name: 'Таблица склонения' })).toBeVisible()
    await expectNoAxeViolations(page, '/practice/table/:wordId')
  })

  test('verb table practice (/practice/verb-table/:wordId/:tense)', async ({ page }) => {
    await page.goto('/words')
    await page.getByRole('searchbox').fill('robić')
    await page.getByRole('link', { name: /robić/ }).first().click()
    await page.getByRole('button', { name: 'Формы слова' }).click()
    await page.getByRole('button', { name: 'Тренировать таблицей' }).click()
    await expect(page).toHaveURL(/\/practice\/verb-table\//)
    await expect(page.getByRole('heading', { name: /Таблица спряжения/ })).toBeVisible()
    await expectNoAxeViolations(page, '/practice/verb-table/:wordId/:tense')
  })

  test('stats (/stats)', async ({ page }) => {
    // A fresh install's `/stats` is a single `EmptyState` — scan it too (real state a new
    // user sees), then generate real progress and scan the full, data-populated layout.
    await page.goto('/stats')
    // `StatsPage` renders nothing but its own `PageHeader` while `summary === undefined`
    // (that first-render loading gate — see the page's own header) — waiting for the
    // `EmptyState` heading closes the same "scanned mid-hydration" race every other test in
    // this file avoids with its own visibility wait before scanning.
    await expect(page.getByText('Пока нет данных')).toBeVisible()
    await expectNoAxeViolations(page, '/stats (empty)')

    await page.goto('/')
    await page.getByRole('button', { name: /обучение|слова/i }).click()
    await expect(page).toHaveURL(/\/session$/)
    await answerChoiceExercise(page)
    await page.getByRole('button', { name: 'Выйти из сессии' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти' }).click()

    await page.goto('/stats')
    await expect(page.getByText('Известно слов')).toBeVisible()
    await expectNoAxeViolations(page, '/stats (populated)')
  })

  test('settings (/settings)', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expectNoAxeViolations(page, '/settings')
  })
})

// ---------------------------------------------------------------------------------------
// The dark-theme pass that used to live here is gone: the app is light-theme only since the
// `spec/design/DESIGN.md` restyle (no `.dark` tokens, no `prefers-color-scheme: dark` mirror
// in `globals.css`), so a dark scan would only re-check the same light screens above.
// ---------------------------------------------------------------------------------------
