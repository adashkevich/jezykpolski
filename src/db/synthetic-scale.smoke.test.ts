/**
 * "Общий смок по приложению" at 20,000 `skills` / 50,000 `reviewLogs` rows
 * (`spec/tasks/26-quality-a11y-e2e.md` §3): "Сгенерировать синтетический прогресс (20 000
 * навыков, 50 000 логов) фикстурой — без него проблемы производительности не проявятся до
 * продакшена", "подтверди, что список слов/сессия/статистика не деградируют при таком
 * объёме — не только `/stats`".
 *
 * `/stats` itself already has its own dedicated, tightly-scoped "<300ms at 20k skills" perf
 * test — `src/db/repositories/stats.repository.test.ts`'s `describe('performance: /stats
 * screen data at 20,000 skills rows', ...)` block, task 23's own acceptance point. This file
 * does NOT duplicate that: it reuses the same shared fixture module
 * (`src/test/fixtures/synthetic-progress.ts`, built for this task rather than a third inline
 * copy)
 * to exercise the other two things a Learn account this size actually touches — the words
 * list query (`content/query.ts#queryWords`, already benchmarked at the `WordIndexEntry`
 * level with no DB in `src/content/query.test.ts`, task 04) and the Learn queue builder
 * (`learning/session/build-learn-queue.ts`, never benchmarked against a real 20k-row `skills`
 * table before this task) — plus one broad "the whole stats read-path still finishes fast at
 * this scale" sanity check, at a deliberately looser budget than task 23's own strict 300ms
 * assertion (this test's point is "nothing here is silently O(n²) at synthetic-account
 * scale", not re-litigating task 23's exact number).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './database.ts'
import { getDueSkills } from './repositories/skills.repository.ts'
import {
  getMorphologyProgress,
  getReviewCounts,
  __resetMorphologyDenominatorsForTest,
} from './repositories/stats.repository.ts'
import {
  getAllWordProgress,
  getWordProgressSummary,
} from './repositories/words-progress.repository.ts'
import { queryWords } from '@/content/query.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { buildLearnQueue } from '@/learning/session/build-learn-queue.ts'
import { buildSyntheticFixture } from '../test/fixtures/synthetic-progress.ts'

beforeEach(async () => {
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  __resetMorphologyDenominatorsForTest()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('synthetic scale smoke: 20,000 skills / 50,000 reviewLogs', () => {
  it('words list, session queue building, and stats all stay fast and correct at this scale', async () => {
    const fixture = buildSyntheticFixture({
      wordCount: 8000,
      skillCount: 20_000,
      logCount: 50_000,
    })
    expect(fixture.skills).toHaveLength(20_000)
    expect(fixture.reviewLogs).toHaveLength(50_000)

    initIndexStore(fixture.entries)
    await db.wordProgress.bulkPut(fixture.wordProgress)
    await db.skills.bulkPut(fixture.skills)
    // bulkAdd (not bulkPut): `reviewLogs`' primary key is auto-increment (`++id`) — every
    // row here deliberately omits `id`, same convention `reviews.repository.ts#logReview`
    // already uses.
    await db.reviewLogs.bulkAdd(fixture.reviewLogs)

    const progress = await getAllWordProgress()

    // ---------------------------------------------------------------------
    // 1. Words list — `queryWords` against a real 20k-skill-backed `progress` map, several
    //    filter shapes a real `/words` visit exercises (level filter, status filter,
    //    search). Same acceptance budget task 04 already established (16ms) — reasserted
    //    here because task 04's own benchmark never ran with a `progress` map this large.
    // ---------------------------------------------------------------------
    const wordQueries = [
      { upToLevel: 'A1' as const, sort: 'frequency' as const },
      { status: ['known'] as const, sort: 'frequency' as const },
      { search: 'synthword1', sort: 'alphabetical' as const },
      { sort: 'level' as const },
    ]
    for (const q of wordQueries) {
      const start = performance.now()
      const result = queryWords(q, progress)
      const elapsedMs = performance.now() - start
      expect(result.length).toBeGreaterThan(0)
      expect(elapsedMs).toBeLessThan(16)
    }

    // ---------------------------------------------------------------------
    // 2. Session queue building — `getDueSkills` (real Dexie `[kind+due]`/`due` index read
    //    over 20,000 rows) + `buildLearnQueue` (pure), the same two-step pipeline
    //    `session-scope.ts#resolveGlobalScope` + `useSessionBootstrap.ts` run for every
    //    "Продолжить обучение" tap. No fixed budget existed for this before this task.
    // ---------------------------------------------------------------------
    const now = Date.now()
    const queueStart = performance.now()
    const dueSkills = await getDueSkills(now, 2000)
    const plan = buildLearnQueue({
      now,
      dueSkills,
      newWordsBudget: 10,
      candidateNewWords: queryWords({ status: ['new'], sort: 'frequency' }, progress),
      targetSize: 20,
    })
    const queueElapsedMs = performance.now() - queueStart
    expect(dueSkills.length).toBeGreaterThan(0)
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.items.length).toBeLessThanOrEqual(20)
    expect(queueElapsedMs).toBeLessThan(300)

    // ---------------------------------------------------------------------
    // 3. Stats read-path — broad sanity, not a re-run of task 23's own strict budget (see
    //    file header). A generous 500ms ceiling covering the summary + review counts +
    //    morphology progress together is enough to catch an accidental full-table scan.
    // ---------------------------------------------------------------------
    const statsStart = performance.now()
    const [summary, reviewCounts, morphology] = await Promise.all([
      getWordProgressSummary(),
      getReviewCounts(now),
      getMorphologyProgress(),
    ])
    const statsElapsedMs = performance.now() - statsStart
    expect(summary.learningTotal + summary.learnedTotal).toBeGreaterThan(0)
    expect(reviewCounts.today).toBeGreaterThanOrEqual(0)
    expect(morphology.hasNounData).toBe(true)
    expect(morphology.hasVerbData).toBe(true)
    expect(statsElapsedMs).toBeLessThan(500)

    console.log(
      `[synthetic-scale smoke] queue build ${queueElapsedMs.toFixed(2)}ms, stats read-path ${statsElapsedMs.toFixed(2)}ms`,
    )
  }, 30_000) // fixture generation + 78,000 bulkPut/bulkAdd rows via fake-indexeddb — see
  // stats.repository.test.ts's own identical footnote for why this budget is for setup, not
  // for the `elapsedMs` assertions above (each measured independently via `performance.now()`).
})
