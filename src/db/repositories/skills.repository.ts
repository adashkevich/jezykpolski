/**
 * `skills` table access (`spec/tasks/05-persistence.md` §2).
 *
 * `ensureSkill` is the ONLY function in the whole app allowed to create a `SkillRecord`
 * (architecture.md §5.2 "Ленивая материализация — критично"). Every other function here
 * only reads or updates rows that already exist; `answer.repository.ts#applyAnswer` also
 * only updates (it throws if the skill isn't there yet — see that file's header).
 */
import { db } from '../database.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type { SkillKind, SkillRecord } from '@/types/progress.ts'

export async function getSkill(skillId: SkillId): Promise<SkillRecord | undefined> {
  return db.skills.get(skillId)
}

export async function getSkillsForWord(wordId: WordId): Promise<SkillRecord[]> {
  return db.skills.where('wordId').equals(wordId).toArray()
}

/**
 * "What's due now" — the app's most important query (architecture.md §8). Uses the plain
 * `due` index when `kind` is omitted, or the compound `[kind+due]` index when it's given
 * (a section-scoped queue, e.g. "only nouns"). Both are covered by an index — no full scan.
 * Results come out ascending by `due` in both cases (Dexie compound-key ordering sorts by
 * the trailing component within a fixed leading component).
 */
export async function getDueSkills(
  now: number,
  limit: number,
  kind?: SkillKind,
): Promise<SkillRecord[]> {
  if (kind !== undefined) {
    return db.skills
      .where('[kind+due]')
      .between([kind, -Infinity], [kind, now], true, true)
      .limit(limit)
      .toArray()
  }
  return db.skills.where('due').belowOrEqual(now).limit(limit).toArray()
}

export async function countDue(now: number, kind?: SkillKind): Promise<number> {
  if (kind !== undefined) {
    return db.skills.where('[kind+due]').between([kind, -Infinity], [kind, now], true, true).count()
  }
  return db.skills.where('due').belowOrEqual(now).count()
}

/** «завтра», «через 7 дней» — how many skills become due in `(from, to]`. */
export async function countDueBetween(from: number, to: number): Promise<number> {
  return db.skills.where('due').between(from, to, false, true).count()
}

export async function upsertSkill(record: SkillRecord): Promise<void> {
  await db.skills.put(record)
}

/**
 * Lazy materialization (architecture.md §5.2): returns the existing `SkillRecord` for
 * `skillId` if one is already there, otherwise creates a fresh `state: 'new'` row and
 * returns that. Idempotent — concurrent/repeated calls for the same `skillId` never create
 * a duplicate and never reset an already-materialized skill's state, because the
 * read-then-write happens inside one `readwrite` transaction on `skills` (IndexedDB
 * serializes readwrite transactions against the same object store, so a second call that
 * starts while the first is still in flight simply waits its turn and then sees the row the
 * first call already inserted).
 *
 * Initial FSRS-facing field values (`state: 'new'`, `stability: 0`, `difficulty: 0`,
 * `due: now`) are this task's own default, not `learning/srs/fsrs-adapter.ts`'s
 * `createInitialState` (task 11, doesn't exist yet — see this task's decision log). They
 * only need to mean "brand new, never reviewed" until the first `applyAnswer` call
 * overwrites them with whatever task 11's adapter actually computes.
 */
export async function ensureSkill(
  skillId: SkillId,
  wordId: WordId,
  kind: SkillKind,
  dimension: Dimension,
): Promise<SkillRecord> {
  return db.transaction('rw', db.skills, async () => {
    const existing = await db.skills.get(skillId)
    if (existing) return existing

    const now = Date.now()
    const fresh: SkillRecord = {
      skillId,
      wordId,
      kind,
      dimension,
      state: 'new',
      stability: 0,
      difficulty: 0,
      due: now,
      reps: 0,
      lapses: 0,
      correct: 0,
      incorrect: 0,
      createdAt: now,
      updatedAt: now,
    }
    await db.skills.add(fresh)
    return fresh
  })
}

/**
 * Forgets everything about one word: deletes every `SkillRecord` for it (so it reverts to
 * `new` — architecture.md §5.4, "нет ни одной записи навыка") and its `wordProgress` cache
 * row. Does NOT touch `reviewLogs` — logs are never deleted except on a full app reset
 * (architecture.md §8, FR-104 needs the history intact for error analysis even for a word
 * the user chose to "start over" on).
 */
export async function resetWord(wordId: WordId): Promise<void> {
  await db.transaction('rw', db.skills, db.wordProgress, async () => {
    await db.skills.where('wordId').equals(wordId).delete()
    await db.wordProgress.delete(wordId)
  })
}
