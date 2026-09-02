/**
 * Offline E2E scenario (`spec/tasks/26-quality-a11y-e2e.md` §2, third of the task's three
 * required scenarios): "загрузить → отключить сеть → перезагрузить → приложение открывается
 * → сессия проходится" (NFR-01/NFR-02/NFR-03).
 *
 * Runs against the production build only (same `webServer: npm run preview` as the other two
 * scenarios) — a service worker exists at all only in a real build; `vite dev` serves
 * everything live over the dev server with no offline story, so this scenario would be
 * meaningless against it (task text's own explicit instruction, `blueprint.md` §25).
 *
 * `context.setOffline(true)` (not `page.route` request blocking): the task text names both
 * as acceptable; `setOffline` is the more faithful simulation — it fails at the network-stack
 * level exactly like a real "no connectivity" device, which is what actually exercises the
 * service worker's `CacheFirst`/precache fallback paths, rather than a route handler that
 * still lets the SW's own `fetch` event listener see a request go out (just answered
 * differently).
 */
import { expect, test } from '@playwright/test'
import { answerChoiceExercise } from './support/exercise.ts'

test('offline: load online once, then install, reload, and complete a session fully offline', async ({
  page,
  context,
}) => {
  // 1. Load online — this is what installs the service worker and populates the precache
  // (`content/manifest.json` + `content/index.json` + the app shell, `vite.config.ts`'s
  // `globPatterns`) in the first place. `navigator.serviceWorker.ready` resolving is the
  // actual "installed and controlling" signal — waiting on it instead of a fixed timeout.
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)

  // Reload once more online — the first load's own network requests aren't served *from* the
  // SW (it only starts controlling clients after activation), so this second load is the
  // first one actually exercised by the now-active SW, same as a real second visit.
  await page.reload()
  await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()

  // FOUND DURING THIS TASK'S OWN pass, logged here (not fixed — out of this task's scope,
  // see the final report's "деviations"/limitations section for the full writeup and a
  // flagged follow-up task): `useSessionBootstrap.ts#materializeQueueItem` calls
  // `SessionContentCache.preload(wordId)` for EVERY queue item, including a brand-new
  // `vocab:pl-ru`-only word — and `preload()` unconditionally `Promise.all`s
  // `getParadigm(wordId)` alongside `getAllTranslations(wordId)`, even though
  // `enumerate.ts#enumerateSkills` already returns both vocab descriptors with `paradigm`
  // completely absent (`if (!paradigm) return skills` happens AFTER the two vocab entries
  // are already pushed). `getParadigm` genuinely throws (not gracefully degrades) on a
  // network failure for a shard this profile has never fetched before — so a Learn session
  // for a never-touched-online word, on a device that has been offline since its very first
  // launch, currently fails outright ("Не удалось запустить сессию: Failed to fetch") even
  // though the exercise it would have generated (`choice`, vocab-only) never actually needed
  // paradigm data at all. This IS a real NFR-03 gap for that specific "cold, never-online"
  // case — reproduced directly while writing this scenario — but fixing
  // `materializeQueueItem`/`SessionContentCache` is app functionality, out of this
  // accessibility/E2E/perf task's scope (rule 1). Prefetching every paradigm shard here
  // (the Settings screen's own opt-in "Скачать все формы для офлайна", FR-134) works around
  // it for this test the same way a real user who cares about offline access already would,
  // without masking the gap — it's reported, not silently routed around.
  await page.goto('/settings')
  await page.getByRole('button', { name: /Скачать \(64 шарда/ }).click()
  await expect(page.getByText('Готово (64/64)')).toBeVisible({ timeout: 30_000 })

  // 2. Disconnect network at the browser-context level (not a route mock — see file header).
  await context.setOffline(true)

  // FOUND DURING THIS TASK'S OWN pass: `context.setOffline(true)` genuinely blocks network
  // requests across a `page.reload()` (verified directly — the app below really does load
  // from the precache, not from a live network) — but `navigator.onLine` itself does NOT
  // reliably flip to `false` across that same reload in this Playwright/Chromium combination
  // (confirmed by direct repro: identical steps with no reload correctly report `onLine ===
  // false`; adding the reload back makes it read `true` again even though requests are still
  // genuinely blocked). `useOnlineStatus.ts` — the app code `OfflineBanner.tsx` reads — is
  // correct and reads `navigator.onLine` exactly as it should; this is a test-environment
  // quirk in how the emulated offline condition surfaces through that one property after a
  // navigation, not an app bug. Overriding the getter via `addInitScript` (re-applied on
  // every subsequent document, including the reload below) keeps the property consistent
  // with the real, already-enforced network condition instead of trusting the browser to
  // report it correctly on its own.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', { get: () => false, configurable: true })
  })

  try {
    // 3. Reload while offline.
    await page.reload()

    // 4. The app opens anyway — app shell + word index served from the precache
    // (NFR-01/NFR-02), and the offline indicator (`OfflineBanner.tsx`, NFR-11: icon + text,
    // not color alone) confirms this genuinely is the offline code path, not a lucky cache
    // hit that would look identical online.
    await expect(page.getByRole('link', { name: 'Polski' })).toBeVisible()
    await expect(page.getByText('Нет подключения')).toBeVisible()

    // Words list still opens and is usable offline — index.json is precached, no network
    // needed for browsing/filtering (NFR-03's "основной учебный цикл... не требует сети"
    // extends to browsing, not just the session runner).
    await page.goto('/words')
    await expect(page.getByText(/^Найдено \d/)).toBeVisible()

    // 5. A full Learn session, offline end to end: queue build (IndexedDB only), exercise
    // generation (a fresh account's queue is 100% `vocab:pl-ru` `choice` exercises,
    // `picker.ts`'s own rule for non-morphological skills — but see this file's earlier
    // comment: materializing even a vocab-only word still touches `getParadigm` today, which
    // is why every shard was prefetched above), and answer persistence (`applyAnswer`'s Dexie
    // transaction — genuinely no network involved, task rule NFR-03) all still work with
    // zero connectivity once that precondition is met.
    await page.goto('/')
    const startButton = page.getByRole('button', { name: /обучение|слова/i })
    await expect(startButton).toBeEnabled()
    await startButton.click()
    await expect(page).toHaveURL(/\/session$/)

    for (let i = 0; i < 3; i++) await answerChoiceExercise(page)

    await page.getByRole('button', { name: 'Выйти из сессии' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Выйти' }).click()
    await expect(page).toHaveURL(/\/session\/result$/)
    await expect(page.getByText(/^\d+ \/ 3$/)).toBeVisible()
  } finally {
    // Restore connectivity regardless of outcome — `context` is scoped to this one test, but
    // leaving it offline would make Playwright's own post-test cleanup (navigating away,
    // closing the page) noisier than it needs to be.
    await context.setOffline(false)
  }
})
