/**
 * Local-calendar-day boundary helpers (`spec/tasks/11-srs.md` §5, blueprint §31: native
 * `Date`, no date library). Used for the "Повторить N сегодня / завтра / за 7 дней" counters
 * (`db/repositories/skills.repository.ts#countDue`/`countDueBetween`).
 *
 * Every function takes and returns `number` (epoch ms) — never `Date` across the boundary
 * (task 11 hard rule 4) — even though the implementation reaches for `Date` internally.
 *
 * Deliberately LOCAL, not UTC: `Date`'s `get*`/`set*` (no `UTC` infix) accessors already read
 * and write in the JS runtime's local timezone, which is exactly what "today" should mean to
 * the user — a UTC-based cutoff would flip "today" over at a time that isn't midnight for
 * most users (e.g. 03:00 in Warsaw, UTC+2), which is precisely the bug this task's own text
 * warns against ("иначе «сегодня» будет съезжать").
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** `00:00:00.000` of `epochMs`'s local calendar day. */
export function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** `23:59:59.999` of `epochMs`'s local calendar day. */
export function endOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * `epochMs` shifted by `days` local calendar days (negative goes back). Uses `Date#setDate`
 * rather than a flat `+ days * MS_PER_DAY` so a DST transition inside the range doesn't skew
 * the result by an hour — "tomorrow" must land on the next calendar day, not on "24h later".
 */
export function addDays(epochMs: number, days: number): number {
  const d = new Date(epochMs)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** `00:00:00.000` of the day after `now`'s local calendar day. */
export function startOfTomorrow(now: number): number {
  return startOfLocalDay(addDays(now, 1))
}

/** `23:59:59.999` of the day after `now`'s local calendar day. */
export function endOfTomorrow(now: number): number {
  return endOfLocalDay(addDays(now, 1))
}

/** `now + 7` local calendar days later, same time-of-day — the upper bound for
 *  `countDueBetween(now, in7Days(now))` ("за 7 дней", task 11 §5). */
export function in7Days(now: number): number {
  return addDays(now, 7)
}

/**
 * `YYYY-MM-DD` in the *local* timezone (matches `DailyStatsRecord.date`'s stated meaning —
 * `types/progress.ts`'s header, "local calendar day"). Deliberately not
 * `toISOString().slice(0, 10)`, which is UTC and would misfile an answer/session near local
 * midnight — precisely the "session around midnight" scenario task 14's acceptance list
 * calls out. Extracted here (task 14) from `db/repositories/answer.repository.ts`'s
 * originally-private copy so `sessions.repository.ts#completeSession` can bucket its own
 * `dailyStats.sessionsCount` bump by the exact same rule, without a second, possibly
 * drifting definition of "today".
 */
export function toLocalDateKey(epochMs: number): string {
  const d = new Date(epochMs)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export { MS_PER_DAY }
