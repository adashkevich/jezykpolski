/**
 * `sessions` table access (`spec/tasks/13-session-runner.md` §5/§6, `spec/architecture.md`
 * §8 — the table itself, and `types/progress.ts`'s `SessionRecord` field list, already exist
 * from task 03/05; no repository for it was built until now).
 *
 * A session's lifecycle here is exactly two writes: `createSession` (on `/session` mount,
 * before the first exercise renders) and `completeSession` (once the queue empties, or the
 * user confirms "Выйти"). Everything in between — every graded answer — goes straight to
 * `skills`/`reviewLogs`/`wordProgress`/`dailyStats` via `answer.repository.ts#applyAnswer`,
 * tagged with this session's `id`; this file never touches those tables.
 *
 * `getIncompleteSession` is what makes "resume after reload" possible (task text §5): a
 * session row with no `endedAt` means the tab was closed (or the app crashed) mid-session.
 * Because `endedAt` is only ever written by `completeSession`, "no `endedAt`" and
 * "abandoned/in-progress" are the same fact — there's no separate status flag to keep in
 * sync.
 */
import { db } from '../database.ts'
import { toLocalDateKey } from '@/lib/dates.ts'
import type { DailyStatsRecord, SessionMode, SessionRecord } from '@/types/progress.ts'

export async function createSession(mode: SessionMode, startedAt: number): Promise<number> {
  // Same widening `reviews.repository.ts#logReview` already documents: Dexie types the
  // return as `number | undefined` because `SessionRecord.id` is itself optional (absent
  // before insert), but `add()` on an auto-increment ('++id') table always resolves with the
  // real assigned key.
  return (await db.sessions.add({
    mode,
    startedAt,
    totalCount: 0,
    correctCount: 0,
    newSkillCount: 0,
    reviewedSkillCount: 0,
  })) as number
}

export interface SessionSummary {
  readonly totalCount: number
  readonly correctCount: number
  readonly newSkillCount: number
  readonly reviewedSkillCount: number
}

/**
 * Writes the final tallies and `endedAt` — called once, either because the queue emptied or
 * because the user confirmed "Выйти" (task text §6: exiting still closes the session, since
 * every answer up to that point is already durably saved). A no-op-safe overwrite of the
 * `sessions` row if called twice (e.g. a defensive double-call) — `update`, not an
 * incrementing write there.
 *
 * Task 14 addition (§3 "При завершении обновляется ... dailyStats за текущую дату"): also
 * bumps `dailyStats.sessionsCount` for the *local calendar day of `endedAt`* — deliberately
 * not `startedAt`, so a session that happens to straddle local midnight (task 14's own
 * acceptance point 7) is credited to the day it actually finished on, the same convention
 * `answer.repository.ts#applyAnswer` already uses for `reviewsCount`/`correctCount` (keyed by
 * each individual answer's own `reviewedAt`, not the session's start). Guarded by
 * `alreadyCompleted` so the sessionsCount bump itself stays a true no-op on a repeat call —
 * every other field in this function was already idempotent (a `put`-style overwrite), and
 * this preserves that property for the one thing here that would otherwise double-count.
 */
export async function completeSession(
  sessionId: number,
  endedAt: number,
  summary: SessionSummary,
): Promise<void> {
  await db.transaction('rw', db.sessions, db.dailyStats, async () => {
    const existing = await db.sessions.get(sessionId)
    const alreadyCompleted = existing?.endedAt !== undefined
    await db.sessions.update(sessionId, { endedAt, ...summary })
    if (alreadyCompleted) return

    const date = toLocalDateKey(endedAt)
    const existingStats = await db.dailyStats.get(date)
    const base: DailyStatsRecord = existingStats ?? {
      date,
      reviewsCount: 0,
      correctCount: 0,
      newSkillsStarted: 0,
      sessionsCount: 0,
      timeSpentMs: 0,
      updatedAt: endedAt,
    }
    await db.dailyStats.put({ ...base, sessionsCount: base.sessionsCount + 1, updatedAt: endedAt })
  })
}

/**
 * Removes a session row outright — task 14 acceptance point 8: a session that ends with
 * zero graded answers (the learner started `/session` and immediately hit "Выйти" before
 * answering anything) must not leave a permanent, empty-summary row behind. Never call this
 * for a session that has any `reviewLogs` — those still reference `sessionId`, and this
 * function does not touch `reviewLogs` itself (task text's own scope: `sessions` never
 * accumulates orphaned rows, but `reviewLogs` is genuinely append-only, architecture.md §8).
 */
export async function deleteSession(sessionId: number): Promise<void> {
  await db.sessions.delete(sessionId)
}

/** The most recently started session that has no `endedAt` yet, or `undefined` if every
 *  session ever started has been completed. `sessions` never accumulates more than a
 *  handful of rows per real user (one per Learn/Practice run), so a full-table scan here —
 *  Dexie has no index on "IS NULL" for an optional field; IndexedDB simply never indexes an
 *  absent key at all — is cheap and never a full 7998-row-style scan. */
export async function getIncompleteSession(): Promise<SessionRecord | undefined> {
  const all = await db.sessions.orderBy('startedAt').reverse().toArray()
  return all.find((session) => session.endedAt === undefined)
}

export async function getSession(sessionId: number): Promise<SessionRecord | undefined> {
  return db.sessions.get(sessionId)
}
