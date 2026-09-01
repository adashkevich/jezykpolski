/**
 * `lib/dates.ts` tests (`spec/tasks/11-srs.md` §5, acceptance point 10: "Границы
 * «сегодня/завтра» корректны при смене таймзоны").
 *
 * Timezone switching: Node/V8 reads the process's local timezone from `process.env.TZ`
 * lazily on each `Date` computation (not cached once at process start), so reassigning it
 * mid-test-run and constructing a fresh `Date` afterwards genuinely changes what "local"
 * means for that `Date` — verified directly against this repo's Node 24 runtime before
 * relying on it here (`process.env.TZ = 'Pacific/Kiritimati'` (UTC+14) vs `'Pacific/Midway'`
 * (UTC-11) around the same UTC instant land on different calendar days, as expected).
 * `vi.stubEnv('TZ', ...)` sets exactly that env var; `vi.unstubAllEnvs()` in `afterEach`
 * restores the runner's real timezone so this file doesn't leak state into later tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  endOfLocalDay,
  endOfTomorrow,
  in7Days,
  startOfLocalDay,
  startOfTomorrow,
} from './dates.ts'

const DAY_MS = 24 * 60 * 60 * 1000

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('startOfLocalDay / endOfLocalDay', () => {
  it('bracket the same instant with exactly one day minus 1ms between them', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 15, 30, 0)
    const start = startOfLocalDay(now)
    const end = endOfLocalDay(now)
    expect(start).toBeLessThanOrEqual(now)
    expect(end).toBeGreaterThanOrEqual(now)
    expect(end - start).toBe(DAY_MS - 1)
  })

  it('start-of-day is midnight local time', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 15, 30, 0)
    const start = new Date(startOfLocalDay(now))
    expect([
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0])
  })
})

describe('addDays', () => {
  it('lands on the next calendar day, same local time-of-day', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 10, 0, 0)
    const tomorrow = new Date(addDays(now, 1))
    const today = new Date(now)
    expect(tomorrow.getDate()).toBe(today.getDate() + 1)
    expect(tomorrow.getHours()).toBe(today.getHours())
  })
})

describe('startOfTomorrow / endOfTomorrow / in7Days', () => {
  it('startOfTomorrow is exactly one local day after startOfLocalDay(now)', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 15, 30, 0)
    expect(startOfTomorrow(now)).toBe(startOfLocalDay(now) + DAY_MS)
  })

  it('endOfTomorrow stays inside the tomorrow bracket', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 15, 30, 0)
    expect(endOfTomorrow(now)).toBe(startOfTomorrow(now) + DAY_MS - 1)
  })

  it('in7Days is 7 local days later', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw')
    const now = Date.UTC(2026, 8, 1, 15, 30, 0)
    expect(in7Days(now)).toBe(addDays(now, 7))
    expect(new Date(in7Days(now)).getDate()).toBe(new Date(now).getDate() + 7)
  })
})

describe('timezone change flips which calendar day "today" is', () => {
  // A single fixed instant, close to UTC midnight, that falls on two different local
  // calendar dates depending on the runtime's timezone.
  const INSTANT = Date.UTC(2026, 8, 1, 23, 30, 0) // 2026-09-01T23:30:00Z

  it('is Sept 2 local in a far-ahead timezone (UTC+14)', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const start = new Date(startOfLocalDay(INSTANT))
    expect(start.getMonth()).toBe(8) // September (0-indexed)
    expect(start.getDate()).toBe(2)
  })

  it('is still Sept 1 local in a far-behind timezone (UTC-11)', () => {
    vi.stubEnv('TZ', 'Pacific/Midway')
    const start = new Date(startOfLocalDay(INSTANT))
    expect(start.getMonth()).toBe(8)
    expect(start.getDate()).toBe(1)
  })

  it('startOfLocalDay(INSTANT) itself differs by timezone, not just its calendar-date reading', () => {
    vi.stubEnv('TZ', 'Pacific/Midway')
    const midwayStart = startOfLocalDay(INSTANT)

    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    const kiritimatiStart = startOfLocalDay(INSTANT)

    // Same instant, same function, two different timezones -> two different epoch-ms
    // results, because they disagree on which calendar day INSTANT falls in (Sept 1 vs
    // Sept 2 local, per the two tests above) — the whole point of computing boundaries in
    // local time rather than UTC.
    expect(kiritimatiStart).not.toBe(midwayStart)
  })
})
