/**
 * `applyAnswer` — the transactional write for one graded answer (`spec/tasks/05-persistence.md`
 * §5, `spec/architecture.md` §8 "Один ответ = одна транзакция readwrite по skills +
 * reviewLogs + wordProgress + dailyStats").
 *
 * IMPORTANT SCOPE NOTE (resolved by the supervisor, logged here per the task's own decision
 * log requirement): the task text says `applyAnswer` "calls the FSRS adapter (task 11) and
 * writes it all at once". But task 05 depends only on task 03, and task 11 (the FSRS
 * adapter) depends on 03 *and* 05 — so no FSRS adapter exists yet at this point, and this
 * file must not create one. `applyAnswer` here is purely a persistence boundary: it takes
 * ALREADY-COMPUTED values (the skill's next SRS-facing fields, the review-log row, and the
 * word's next denormalized progress row) and atomically writes them. It does not import
 * `ts-fsrs`, does not decide ratings, and does not run `learning/progress/aggregate.ts`
 * itself. Task 11 becomes the caller: it will call `ensureSkill`, run the FSRS adapter, run
 * `words-progress.repository.ts#computeWordProgress` with the hypothetical post-answer skill
 * set, and hand all three results to this function.
 *
 * `nextWordProgress` is passed in fully computed (rather than this file calling
 * `computeWordProgress` itself) for a concrete technical reason, not just layering taste:
 * `computeWordProgress` awaits `getParadigm`, which can touch the network
 * (`content/loader.ts`, task 04). Holding an IndexedDB `readwrite` transaction open across a
 * `fetch()` round trip is unsafe — the transaction can auto-commit once control returns to
 * the event loop, so a later Dexie call inside the same `db.transaction(...)` callback could
 * throw. Keeping every step inside `applyAnswer`'s transaction a plain, already-in-memory
 * Dexie read/write sidesteps that hazard entirely, which is also why this function requires
 * the skill to already exist (`ensureSkill` must run first, outside this transaction) rather
 * than materializing it itself.
 */
import { db } from '../database.ts'
import { toLocalDateKey } from '@/lib/dates.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type {
  ReviewLogRecord,
  SkillKind,
  SkillRecord,
  WordProgressRecord,
} from '@/types/progress.ts'

export interface AnswerInput {
  readonly skillId: SkillId
  readonly wordId: WordId
  readonly kind: SkillKind

  /**
   * The skill's next FSRS-facing fields, already computed by the caller's FSRS adapter call
   * (task 11). Applied to `skills` only when `reviewLog.srsApplied` is true — mirrors the
   * damping rules in architecture.md §6.3 (an in-session error repeat, or part of a
   * practice run, must NOT move the SRS schedule, even though it's still logged and still
   * counted in the skill's applied `correct`/`incorrect` stats).
   */
  readonly nextSrsState: Pick<
    SkillRecord,
    'state' | 'stability' | 'difficulty' | 'due' | 'reps' | 'lapses' | 'lastReviewAt'
  >

  /** Appended to `reviewLogs` verbatim; the repository assigns the auto-increment `id`. */
  readonly reviewLog: Omit<ReviewLogRecord, 'id'>

  /** True the first time this exact `skillId` ever receives a graded answer — increments
   *  `dailyStats.newSkillsStarted` for `reviewLog.reviewedAt`'s local calendar day. Not
   *  derivable from `skills` alone inside the transaction (a freshly-`ensureSkill`'d row
   *  looks the same as one being reviewed for the 2nd time until this write happens), so
   *  the caller — which just called `ensureSkill` and can see whether that call created a
   *  new row — passes it in directly. */
  readonly isNewSkill: boolean

  /** The word's full next `wordProgress` row (see file header for why this is precomputed
   *  rather than derived in here). Always defined: `wordId` has at least this one skill. */
  readonly nextWordProgress: WordProgressRecord
}

/**
 * Atomically writes one graded answer across `skills` + `reviewLogs` + `wordProgress` +
 * `dailyStats`. Throws (aborting the whole transaction, leaving every table untouched) if
 * `input.skillId` has no existing `SkillRecord` — `ensureSkill` is the only place allowed
 * to create one (architecture.md §5.2), and it must have already run before `applyAnswer`.
 */
export async function applyAnswer(input: AnswerInput): Promise<void> {
  await db.transaction('rw', db.skills, db.reviewLogs, db.wordProgress, db.dailyStats, async () => {
    const skill = await db.skills.get(input.skillId)
    if (!skill) {
      throw new Error(
        `applyAnswer: no SkillRecord for "${input.skillId}" — call ensureSkill() before applyAnswer().`,
      )
    }

    const correct = input.reviewLog.correct
    const updatedSkill: SkillRecord = {
      ...skill,
      ...(input.reviewLog.srsApplied ? input.nextSrsState : {}),
      correct: skill.correct + (correct ? 1 : 0),
      incorrect: skill.incorrect + (correct ? 0 : 1),
      updatedAt: input.reviewLog.reviewedAt,
    }
    await db.skills.put(updatedSkill)

    await db.reviewLogs.add(input.reviewLog)

    await db.wordProgress.put(input.nextWordProgress)

    const date = toLocalDateKey(input.reviewLog.reviewedAt)
    const existingStats = await db.dailyStats.get(date)
    const base = existingStats ?? {
      date,
      reviewsCount: 0,
      correctCount: 0,
      newSkillsStarted: 0,
      sessionsCount: 0,
      timeSpentMs: 0,
      updatedAt: input.reviewLog.reviewedAt,
    }
    await db.dailyStats.put({
      ...base,
      reviewsCount: base.reviewsCount + 1,
      correctCount: base.correctCount + (correct ? 1 : 0),
      newSkillsStarted: base.newSkillsStarted + (input.isNewSkill ? 1 : 0),
      timeSpentMs: base.timeSpentMs + input.reviewLog.elapsedMs,
      updatedAt: input.reviewLog.reviewedAt,
    })
  })
}
