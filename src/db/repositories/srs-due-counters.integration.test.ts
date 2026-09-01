/**
 * `spec/tasks/11-srs.md` §5 ("Счётчики для главной и статистики") + acceptance point 9:
 * "`countDue` для пустой БД = 0, не падает". Exercises `db/repositories/skills.repository.ts`
 * (task 05) together with `lib/dates.ts` (this task) exactly the way a home-screen widget
 * would: "Повторить N" / "завтра" / "7 дней".
 *
 * Under `src/db/repositories/` (not `src/learning/**`) for the same reason
 * `srs-rule1.integration.test.ts` is — seeding/reading `db.skills`/`db.reviewLogs` directly
 * needs the `src/db/**` exemption from the "no direct Dexie `db` instance import" rule.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { countDue, countDueBetween } from './skills.repository.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { endOfTomorrow, in7Days, startOfTomorrow } from '@/lib/dates.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

const NOW = Date.UTC(2026, 8, 1, 9, 0, 0)

function makeSkill(
  overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'wordId' | 'due'>,
): SkillRecord {
  return {
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 10,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('due counters on an empty DB (acceptance point 9)', () => {
  it('countDue is 0 and does not throw', async () => {
    await expect(countDue(NOW)).resolves.toBe(0)
  })

  it('"tomorrow" and "7 days" counters are also 0 and do not throw', async () => {
    await expect(countDueBetween(startOfTomorrow(NOW), endOfTomorrow(NOW))).resolves.toBe(0)
    await expect(countDueBetween(NOW, in7Days(NOW))).resolves.toBe(0)
  })
})

describe('due counters sort skills into today / tomorrow / within-7-days buckets', () => {
  it('"Повторить N" / "завтра" / "7 дней" count the right skills', async () => {
    await db.skills.bulkAdd([
      makeSkill({ skillId: 'overdue', wordId: 'w1', due: NOW - 60 * 60 * 1000 }), // due earlier today
      makeSkill({ skillId: 'later-today', wordId: 'w2', due: NOW + 60 * 1000 }),
      makeSkill({ skillId: 'tomorrow', wordId: 'w3', due: startOfTomorrow(NOW) + 60 * 1000 }),
      makeSkill({ skillId: 'in-3-days', wordId: 'w4', due: NOW + 3 * 24 * 60 * 60 * 1000 }),
      makeSkill({ skillId: 'in-10-days', wordId: 'w5', due: NOW + 10 * 24 * 60 * 60 * 1000 }),
    ])

    // "Повторить N" — overdue or due within today, i.e. <= now.
    expect(await countDue(NOW)).toBe(1) // only "overdue"

    // "завтра" — due strictly within tomorrow's local calendar day.
    expect(await countDueBetween(startOfTomorrow(NOW), endOfTomorrow(NOW))).toBe(1) // "tomorrow"

    // "7 дней" — due within the next 7 days from now (includes "later-today", "tomorrow",
    // "in-3-days"; excludes "overdue" which is <= now, and "in-10-days" which is past the
    // window).
    expect(await countDueBetween(NOW, in7Days(NOW))).toBe(3)
  })
})
