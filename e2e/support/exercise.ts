/**
 * Generic "answer whatever exercise is on screen" helpers for E2E scenarios
 * (`spec/tasks/26-quality-a11y-e2e.md` §2).
 *
 * Every scenario in this suite forces the session's exercise type to `choice`/`form-choice`
 * before starting a session (`Настройки` → "Тип задания по умолчанию" → only "Выбор"
 * checked, `learning/exercises/default-exercise-type.ts#resolveForceCategory`) — a fresh
 * account's Learn/mistake-review queues are otherwise a mix of `choice` (new skills) and
 * other types the moment a skill's SRS state moves past `'new'`, and this suite needs
 * deterministic DOM shape (`ChoiceExercise.tsx`'s `role="radiogroup"` of `role="radio"`
 * buttons) across every question, not just the first one.
 */
import { expect, type Page } from '@playwright/test'

/**
 * Answers the current `choice`/`form-choice` exercise by clicking its first option, waits
 * for the graded feedback banner (`ExerciseFeedback.tsx`'s `role="status"` panel — "Верно!" /
 * "Почти! Проверь диакритики" / "Неверно", NFR-11: never color alone), then advances via
 * "Далее". Returns whether this answer was graded correct, so the caller can accumulate a
 * concrete mix of right/wrong answers without needing to know the correct option in advance.
 */
export async function answerChoiceExercise(page: Page): Promise<boolean> {
  const radiogroup = page.getByRole('radiogroup', { name: 'Варианты ответа' })
  await expect(radiogroup).toBeVisible()
  await radiogroup.getByRole('radio').first().click()

  const feedback = page.getByRole('status').filter({ hasText: /Верно!|Неверно|Почти/ })
  await expect(feedback).toBeVisible()
  const feedbackText = await feedback.innerText()
  const correct = feedbackText.includes('Верно!')

  await page.getByRole('button', { name: 'Далее' }).click()
  return correct
}

/**
 * Answers exercises one at a time (via `answerChoiceExercise`) until at least `minCount`
 * have been answered AND at least one was wrong — the critical-flow scenario's step 9/10
 * ("Разобрать ошибки" must have something to review) needs a guaranteed mistake, not a lucky
 * one. With 3-4 options per `choice` exercise (`learning/exercises/distractors.ts`), the odds
 * of `maxAttempts` (15) consecutive correct guesses are astronomically low — this is a
 * defensive cap against an infinite loop, not an expected outcome.
 */
export async function answerUntilAtLeastOneMistake(
  page: Page,
  minCount = 5,
  maxAttempts = 15,
): Promise<{ answered: number; mistakes: number }> {
  let answered = 0
  let mistakes = 0
  while (answered < maxAttempts) {
    const correct = await answerChoiceExercise(page)
    answered++
    if (!correct) mistakes++
    if (answered >= minCount && mistakes >= 1) break
  }
  expect(mistakes, `expected at least one wrong answer within ${maxAttempts} attempts`).toBeGreaterThan(0)
  return { answered, mistakes }
}

/**
 * Answers every remaining exercise in the current session (`choice`-only, per this file's
 * header) until the queue empties and the app navigates away from `/session`. Used for the
 * mistake-review pass, whose queue length equals however many mistakes the first pass
 * produced — not a fixed count the caller can know up front.
 *
 * Races the next question's radiogroup becoming visible against the URL leaving `/session`
 * on every iteration — including the first — rather than a bare, non-waiting
 * `Locator#isVisible()` check: that synchronous check can run before React has finished the
 * current async render pass (queue build on iteration 0, or the "advance to next question"
 * state update on later ones), incorrectly reading "not visible yet" as "session ended" and
 * returning 0. Racing the two (instead of waiting out a fixed timeout for the radiogroup
 * before falling back to a URL check) also means a session's natural end is detected the
 * moment the redirect actually happens, not after `waitTimeoutMs` of unnecessary waiting.
 */
export async function answerUntilSessionEnds(
  page: Page,
  maxAttempts = 15,
  waitTimeoutMs = 10_000,
): Promise<number> {
  let answered = 0
  while (answered < maxAttempts) {
    if (!new URL(page.url()).pathname.startsWith('/session') || page.url().includes('/session/result')) {
      break
    }
    const radiogroup = page.getByRole('radiogroup', { name: 'Варианты ответа' })
    const outcome = await Promise.race([
      radiogroup.waitFor({ state: 'visible', timeout: waitTimeoutMs }).then(() => 'question' as const),
      page
        .waitForURL((url) => !url.pathname.startsWith('/session') || url.pathname.endsWith('/result'), {
          timeout: waitTimeoutMs,
        })
        .then(() => 'ended' as const),
    ]).catch(() => 'timeout' as const)
    if (outcome === 'ended') break
    if (outcome === 'timeout') {
      // Neither race leg resolved in time — re-check the URL once more before treating this
      // as a real failure (`answerChoiceExercise` below will throw its own clear error if
      // the radiogroup genuinely never showed up).
      if (!new URL(page.url()).pathname.startsWith('/session')) break
    }
    await answerChoiceExercise(page)
    answered++
  }
  return answered
}
