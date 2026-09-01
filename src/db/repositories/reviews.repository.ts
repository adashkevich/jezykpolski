/**
 * `reviewLogs` table access (`spec/tasks/05-persistence.md` §3).
 *
 * Append-only: nothing here ever updates or deletes a row (architecture.md §8, "Логи
 * никогда не удаляются (кроме полного сброса)" — full reset lives outside this task's
 * scope). `logReview` is exposed for completeness/testing; the normal way a row gets
 * written is `answer.repository.ts#applyAnswer`, inside its one atomic transaction.
 */
import { db } from '../database.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'

export async function logReview(entry: ReviewLogRecord): Promise<number> {
  // Dexie's typing widens the return to `number | undefined` because `ReviewLogRecord.id`
  // is itself optional (absent before insert) — but `add()` on an auto-increment ('++id')
  // table always resolves with the real assigned key, never `undefined`, so this narrows
  // back to the documented `Promise<number>` return type instead of leaking the widened one.
  return (await db.reviewLogs.add(entry)) as number
}

/** Most recent first — useful for "recent mistakes on this word" views. */
export async function getLogsForWord(wordId: WordId, limit: number): Promise<ReviewLogRecord[]> {
  return db.reviewLogs
    .where('[wordId+reviewedAt]')
    .between([wordId, -Infinity], [wordId, Infinity], true, true)
    .reverse()
    .limit(limit)
    .toArray()
}

export async function getLogsForSession(sessionId: number): Promise<ReviewLogRecord[]> {
  return db.reviewLogs.where('sessionId').equals(sessionId).toArray()
}

export async function getLogsSince(ts: number): Promise<ReviewLogRecord[]> {
  return db.reviewLogs.where('reviewedAt').aboveOrEqual(ts).toArray()
}
