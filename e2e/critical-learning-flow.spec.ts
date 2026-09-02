/**
 * Critical learning-flow E2E scenario (`spec/tasks/26-quality-a11y-e2e.md` §2, first of the
 * task's three required scenarios) — runs against the production build (`playwright.config.ts`'s
 * `webServer` runs `npm run preview`, never `npm run dev`: `blueprint.md` §25's service worker
 * caveat, task text's own explicit instruction).
 *
 * Follows the task text's 10-step script, adapted to the app's real, current UI (task 19
 * changed what the words-list "Учить" FAB does after this task's own text was written — see
 * inline notes below for exactly where and why):
 *
 *  1. open the app
 *  2. wait for the word index to load
 *  3. open the words list, apply an "up to A1" filter
 *  4. start a Learn session ("Продолжить обучение"/"Начать обучение")
 *  5. answer several exercises, a genuine mix of correct/incorrect
 *  6. reach the results screen
 *  7. reload the browser
 *  8. verify: progress survived, home counters updated
 *  9. open "Разобрать ошибки", complete it
 *  10. verify: the mistake's SRS state did NOT improve from the mistake-review repeat
 *
 * DEVIATION (logged here for the decision log, per the task's own rule 7): step 4's "запустить
 * «Продолжить обучение»" is interpreted as Home's own CTA (global Learn scope), not the
 * words-list "Учить" FAB — that FAB now navigates to `/practice` (task 19's setup screen,
 * `LearnFab.tsx`'s own header explains the change), which only ever builds a *morphology*
 * Practice queue (`mode: 'practice'`), a scope this scenario's step 10 assertion doesn't apply
 * to (`policy.ts#shouldApplySrs` only special-cases `'mistakes'`, not `'practice'`). Using
 * Home's CTA keeps the scenario on the real Learn (`mode: 'learn'`) → mistake-review
 * (`mode: 'mistakes'`) path step 10 is actually about. Step 3's filter is still exercised in
 * full (`/words` list renders, filters, and its result count updates), just decoupled from
 * which words the session itself draws on.
 *
 * Every exercise here is `choice` (`ChoiceExercise.tsx`'s `role="radiogroup"`): a brand-new
 * account's Learn queue is 100% `vocab:pl-ru` skills at `state: 'new'`
 * (`build-session-exercises.ts#materializeQueueItem`), and `picker.ts#pickExerciseType`
 * always returns `'choice'` for a non-morphological skill with no restriction in force — this
 * scenario also pins "Тип задания по умолчанию" to "Выбор" only in Settings first, so the
 * later mistake-review pass (same non-Practice scope resolution,
 * `useSessionBootstrap.ts#buildAndStart`) stays `choice` too, not just the first pass.
 */
import { expect, test } from '@playwright/test'
import { dbGetByKeys, getHistoryStateSessionId, STORE } from './support/db.ts'
import { answerUntilAtLeastOneMistake, answerUntilSessionEnds } from './support/exercise.ts'

interface ReviewLogRow {
  sessionId: number
  skillId: string
  correct: boolean
  reviewedAt: number
}

interface SkillRow {
  skillId: string
  state: string
  stability: number
  difficulty: number
  due: number
  reps: number
  lapses: number
  lastReviewAt?: number
  correct: number
  incorrect: number
}

test('critical learning flow: filter, learn, reload, mistake review, SRS damping', async ({ page }) => {
  // 1-2. Open the app, wait for the word index to load (LoadingScreen shows "Ładowanie
  // słownika…" with role="status" while `manifest.json`/`index.json` are in flight; the real
  // app shell's header only renders once that resolves).
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()

  // Pin exercise type to "Выбор" only — see this file's header for why (deterministic
  // `choice` DOM shape across every question, including the later mistake-review pass).
  await page.goto('/settings')
  const inputCheckbox = page.getByRole('checkbox', { name: 'Ввод' })
  if (await inputCheckbox.isChecked()) {
    await inputCheckbox.click()
  }
  await expect(page.getByRole('checkbox', { name: 'Выбор' })).toBeChecked()
  await expect(inputCheckbox).not.toBeChecked()

  // 3. Words list, "до A1" filter — real UI path: level chip "A1" + "До уровня" checkbox
  // (`LevelFilter.tsx`), then confirm the result count actually narrowed.
  await page.goto('/words')
  const foundCount = page.getByText(/^Найдено /)
  await expect(foundCount).toBeVisible()
  const beforeFilterText = await foundCount.innerText()

  await page.getByRole('checkbox', { name: /До уровня/ }).check()
  await page.getByRole('button', { name: 'A1', exact: true }).click()
  await expect(foundCount).not.toHaveText(beforeFilterText)
  const afterFilterText = await foundCount.innerText()
  expect(afterFilterText).toMatch(/^Найдено \d/)

  // 4. Home's own CTA — global Learn scope (see file header for why not the words-list FAB).
  await page.goto('/')
  const startButton = page.getByRole('button', { name: /обучение|слова/i })
  await expect(startButton).toBeEnabled()
  await startButton.click()
  await expect(page).toHaveURL(/\/session$/)

  // 5. A genuine mix of correct/incorrect answers — at least 5, guaranteed at least one wrong
  // (needed for step 9's "Разобрать ошибки" to have anything to review).
  const { answered, mistakes } = await answerUntilAtLeastOneMistake(page, 5)
  expect(answered).toBeGreaterThanOrEqual(5)
  expect(mistakes).toBeGreaterThanOrEqual(1)

  // End the session now via "Выйти" (real user control, `SessionRunner.tsx`'s header:
  // "Прогресс уже сохранён... но сессия закроется") rather than answering the full default
  // queue (target size 10, the UI's own minimum) — this is what turns "answer 5" into "reach
  // the results screen" without over-answering.
  await page.getByRole('button', { name: 'Выйти из сессии' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти' }).click()

  // 6. Results screen.
  await expect(page).toHaveURL(/\/session\/result$/)
  const scoreText = page.getByText(new RegExp(`^\\d+ / ${answered}$`))
  await expect(scoreText).toBeVisible()

  const sessionId = await getHistoryStateSessionId(page)
  expect(sessionId).toBeDefined()

  // 7. Reload the browser — while still on `/session/result` (its `sessionId` router state
  // lives in the History API's own per-entry state, which a reload does not discard, see
  // `support/db.ts#getHistoryStateSessionId`'s own header).
  await page.reload();
  await expect(page).toHaveURL(/\/session\/result$/)
  await expect(scoreText).toBeVisible()
  const mistakesHeading = page.getByRole('heading', { name: 'Ошибки' })
  await expect(mistakesHeading).toBeVisible()

  // 8. Progress survived, home counters updated. Scoped to the "Сегодня" card specifically
  // (its own parent), not a bare page-wide `/повторени/` text search — the "Повторить"
  // card's own reviewDescription paragraph ("N слов готовы к повторению") also contains that
  // substring and would make an unscoped search ambiguous (Playwright strict mode).
  await page.goto('/')
  const todayCard = page.getByText('Сегодня', { exact: true }).locator('..')
  const todayBlock = todayCard.getByText(/повторени/)
  // `HomePage`'s "Сегодня" block renders "0 повторений · 0 новых слов" as its own loading
  // placeholder before `useDailyStats()`'s live query resolves (`dailyStats?.reviewsCount ??
  // 0`) — same race `data-portability.spec.ts` documents for the "Слова" block; wait past
  // the zero placeholder before trusting the read.
  await expect(todayBlock).not.toHaveText(/^0 повторений/)
  const todayText = await todayBlock.innerText()
  expect(todayText).not.toMatch(/^0 повторений/)

  // Snapshot the mistake skill(s)' SRS-facing fields BEFORE the mistake-review pass —
  // fetched via the raw `reviewLogs`/`skills` object stores, not re-derived from the UI.
  const mistakeSkillIds = await page.evaluate(async (sid) => {
    return new Promise<string[]>((resolve, reject) => {
      const req = indexedDB.open('PolishLearningDB')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('reviewLogs', 'readonly')
        const getAllReq = tx.objectStore('reviewLogs').getAll()
        getAllReq.onsuccess = () => {
          const logs = (getAllReq.result as ReviewLogRow[]).filter((l) => l.sessionId === sid)
          const bySkill = new Map<string, ReviewLogRow>()
          for (const log of [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
            if (!bySkill.has(log.skillId)) bySkill.set(log.skillId, log)
          }
          resolve([...bySkill.values()].filter((l) => !l.correct).map((l) => l.skillId))
          db.close()
        }
        getAllReq.onerror = () => {
          reject(getAllReq.error)
          db.close()
        }
      }
    })
  }, sessionId)
  expect(mistakeSkillIds.length).toBeGreaterThanOrEqual(1)

  const beforeSkills = await dbGetByKeys<SkillRow>(page, STORE.skills, mistakeSkillIds)
  for (const s of beforeSkills) expect(s).toBeDefined()

  // 9. Back to the results page (browser history — same entry, `sessionId` state intact),
  // "Разобрать ошибки", complete it.
  await page.goBack()
  await expect(page).toHaveURL(/\/session\/result$/)
  await page.getByRole('button', { name: 'Разобрать ошибки' }).click()
  await expect(page).toHaveURL(/\/session$/)
  // At least one answer per mistake skill — possibly more: getting a skill wrong AGAIN
  // during mistake review still triggers `SessionRunner.tsx`'s same damping-repeat requeue
  // (it has no `mode` check of its own), so the exact count isn't fixed, only its floor.
  const mistakeAnswered = await answerUntilSessionEnds(page, 30)
  expect(mistakeAnswered).toBeGreaterThanOrEqual(mistakeSkillIds.length)
  await expect(page).toHaveURL(/\/session\/result$/)

  // 10. SRS state did NOT improve (in fact must be byte-for-byte unchanged —
  // `policy.ts#shouldApplySrs` returns `false` unconditionally for `mode: 'mistakes'`,
  // `answer.repository.ts#applyAnswer` then never spreads `nextSrsState` into the row at
  // all) — every FSRS-facing field asserted equal, not just "no worse".
  const afterSkills = await dbGetByKeys<SkillRow>(page, STORE.skills, mistakeSkillIds)
  for (let i = 0; i < mistakeSkillIds.length; i++) {
    const before = beforeSkills[i]!
    const after = afterSkills[i]!
    expect(after.state, `state changed for ${mistakeSkillIds[i]}`).toBe(before.state)
    expect(after.stability, `stability changed for ${mistakeSkillIds[i]}`).toBe(before.stability)
    expect(after.difficulty, `difficulty changed for ${mistakeSkillIds[i]}`).toBe(before.difficulty)
    expect(after.due, `due changed for ${mistakeSkillIds[i]}`).toBe(before.due)
    expect(after.reps, `reps changed for ${mistakeSkillIds[i]}`).toBe(before.reps)
    expect(after.lapses, `lapses changed for ${mistakeSkillIds[i]}`).toBe(before.lapses)
    // `correct`/`incorrect` (applied-answer counters, independent of the FSRS schedule) DO
    // still increment for a mistake-review answer — `answer.repository.ts#applyAnswer` always
    // bumps these regardless of `srsApplied`. Asserting they moved is this test's positive
    // control: it proves the mistake-review answer was actually recorded, not silently
    // skipped, which is what makes the *absence* of change in the six fields above meaningful
    // rather than just "nothing happened at all".
    expect(after.correct + after.incorrect).toBeGreaterThan(before.correct + before.incorrect)
  }
})
