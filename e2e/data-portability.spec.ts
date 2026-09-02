/**
 * Data-portability E2E scenario (`spec/tasks/26-quality-a11y-e2e.md` §2, second of the
 * task's three required scenarios): "экспорт → сброс → импорт → прогресс идентичен".
 *
 * `db/repositories/backup.repository.ts` (task 24) already has full unit coverage of the
 * export/import/reset logic itself — this test exercises the real UI path end to end
 * instead: a real file downloaded via the browser's download mechanism
 * (`page.waitForEvent('download')`), fed back in via a real `<input type="file">`
 * (`page.setInputFiles`), against the real `Settings` screen (`features/settings/**`).
 */
import { expect, test } from '@playwright/test'
import { answerUntilSessionEnds } from './support/exercise.ts'

test('export -> reset -> import restores progress identically', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()

  // Generate some real progress first — a fresh install has nothing to export. Also shrinks
  // "Заданий в сессии" to 10 (the Settings dropdown's own minimum) and answers the session
  // through to its NATURAL end (`answerUntilSessionEnds`, not an early "Выйти").
  //
  // FOUND DURING THIS TASK'S OWN pass, worth recording: exiting a session early leaves some
  // of its queue's words with a real `SkillRecord` (`useSessionBootstrap.ts` eagerly
  // materializes the WHOLE queue via `ensureSkill` up front) but no `wordProgress` row yet —
  // that row is only written by `applyAnswer`, on an actual answer, per
  // `words-progress.repository.ts`'s own "denormalized cache" framing. `applyImport`'s
  // `recomputeAll()` then derives `wordProgress` fresh from EVERY skill that exists,
  // including those never-answered ones (`aggregate.ts#deriveStatus`: any word with at least
  // one `SkillRecord`, even at zero reps, already counts as `'learning'`) — so a live
  // "before" snapshot taken right after an early exit can legitimately show FEWER
  // "изучается" words than a re-import of the exact same underlying `skills` rows. That's
  // not an export/import bug (the `skills` table — the real source of truth NFR-16 cares
  // about — round-trips correctly either way; `wordProgress` is never part of the backup
  // schema at all, see `db/backup.schema.ts`), it's this test's own scenario needing to
  // avoid creating that "materialized but never answered" asymmetry in the first place —
  // answering every queued item removes it at the source, which is what this scenario does.
  await page.goto('/settings')
  const inputCheckbox = page.getByRole('checkbox', { name: 'Ввод' })
  if (await inputCheckbox.isChecked()) await inputCheckbox.click()
  await page.getByRole('combobox', { name: 'Заданий в сессии' }).selectOption('10')

  await page.goto('/')
  await page.getByRole('button', { name: /обучение|слова/i }).click()
  await expect(page).toHaveURL(/\/session$/)
  // At least 10 (the queue length) — possibly a few more: a wrong first answer gets
  // requeued once within the same session (`SessionRunner.tsx`'s damping-repeat mechanic),
  // so the exact count isn't fixed, only its floor. Either way every originally-queued skill
  // ends up answered at least once by the time the queue empties, which is what actually
  // matters here (see the comment above).
  const answeredCount = await answerUntilSessionEnds(page, 20)
  expect(answeredCount).toBeGreaterThanOrEqual(10)
  await expect(page).toHaveURL(/\/session\/result$/)

  // Capture the "before" progress signature — home + stats screens, both `useLiveQuery`-
  // backed off the same tables the backup covers (`skills`/`reviewLogs`/`sessions`/
  // `dailyStats`/`settings`, `db/backup.schema.ts#BackupExportSchema`). `/^\d+\s+повторени/`
  // (not a bare `/повторени/` substring): the "Повторить" card's own reviewDescription
  // paragraph also contains "повторени" ("N слов готовы к повторению") and would otherwise
  // make this locator ambiguous — only the "Сегодня" block's text starts with a digit
  // immediately followed by "повторени" (same fix as `critical-learning-flow.spec.ts`).
  //
  // Captured (and later re-captured) via `.innerText()`, then compared with plain `===`
  // rather than Playwright's `toHaveText()` matcher: `toHaveText` asserts against
  // `textContent`, which does NOT apply CSS `text-transform` (`BigStat`'s label span is
  // `uppercase` — `StatsPage.tsx`), while `.innerText()` DOES (it reflects rendered layout).
  // Mixing the two — capturing via `.innerText()` but asserting via `toHaveText()` — compares
  // an uppercased, newline-joined string against a lowercase, concatenated one and fails even
  // when the underlying data is genuinely identical; using `.innerText()` on both sides of a
  // plain equality check avoids that mismatch entirely.
  await page.goto('/')
  // `HomePage`'s "Слова" block renders "0 изучается · 0 выучено" as its own loading
  // placeholder BEFORE `useWordProgressSummary()`'s live query resolves (`summary?.learningTotal
  // ?? 0`) — the element exists and is visible from the very first paint, so a bare
  // `.innerText()` read (which waits for "attached and visible", not "reflects final data")
  // can win the race and capture that placeholder instead of the real post-session numbers.
  // Waiting for the text to actually move off the zero placeholder first closes that race.
  const wordsBlockLocator = page.getByText(/изучается ·/)
  await expect(wordsBlockLocator).not.toHaveText('0 изучается · 0 выучено')
  const wordsBlockBefore = await wordsBlockLocator.innerText()
  // Scoped to the "Сегодня" card specifically (its own parent), not a bare page-wide
  // `/повторени/` text search — the "Повторить" card's reviewDescription paragraph ("N слов
  // готовы к повторению") also contains that substring and would make an unscoped search
  // ambiguous (Playwright strict mode).
  const todayCard = page.getByText('Сегодня', { exact: true }).locator('..')
  const todayBlockBefore = await todayCard.getByText(/повторени/).innerText()

  await page.goto('/stats')
  const knownBefore = await page.getByText('Известно слов').locator('..').innerText()
  const learningBefore = await page.getByText('Изучается', { exact: true }).locator('..').innerText()

  // --- Export ---
  await page.goto('/settings')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать' }).click(),
  ])
  await expect(page.getByText('Файл скачан.')).toBeVisible()
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()

  // --- Reset ---
  await page.getByRole('button', { name: 'Сбросить' }).click()
  await page
    .getByRole('checkbox', { name: 'Я понимаю, что все данные будут удалены безвозвратно' })
    .check()
  await page.getByRole('button', { name: 'Сбросить всё' }).click()
  await expect(page.getByText('Сброшено')).toBeVisible()

  // Confirm the reset actually took (home goes back to the fresh-install empty state) before
  // trusting the import half of this test to prove anything.
  await page.goto('/')
  await expect(page.getByText('Добро пожаловать!')).toBeVisible()
  await page.goto('/stats')
  await expect(page.getByText('Пока нет данных')).toBeVisible()

  // --- Import ---
  // Sets the file directly on the hidden `<input type="file">` rather than clicking the
  // visible "Выбрать файл" button first — that button's `onClick` calls the real input's
  // `.click()`, which would open a native OS file-picker dialog Playwright cannot drive.
  // `setInputFiles` on the input itself dispatches the same `change` event `handleFileChosen`
  // listens for, without ever going through that dialog.
  await page.goto('/settings')
  await page.setInputFiles('input[type="file"]', downloadPath!)
  await expect(page.getByText(/Будет импортировано/)).toBeVisible()
  await page.getByRole('button', { name: 'Импортировать' }).click()
  await expect(page.getByText(/^Готово: импортировано/)).toBeVisible()

  // --- Verify: identical to the "before" snapshot ---
  await page.goto('/')
  // Same loading-placeholder race as the "before" capture above — wait past "0 изучается · 0
  // выучено" before trusting the read (a *literal* zero-progress result here would otherwise
  // be indistinguishable from "still loading", so this also doubles as a real assertion that
  // import actually restored something rather than nothing).
  await expect(wordsBlockLocator).not.toHaveText('0 изучается · 0 выучено')
  const wordsBlockAfter = await wordsBlockLocator.innerText()
  expect(wordsBlockAfter).toBe(wordsBlockBefore)
  const todayBlockAfter = await todayCard.getByText(/повторени/).innerText()
  expect(todayBlockAfter).toBe(todayBlockBefore)

  await page.goto('/stats')
  const knownAfter = await page.getByText('Известно слов').locator('..').innerText()
  expect(knownAfter).toBe(knownBefore)
  const learningAfter = await page.getByText('Изучается', { exact: true }).locator('..').innerText()
  expect(learningAfter).toBe(learningBefore)
})
