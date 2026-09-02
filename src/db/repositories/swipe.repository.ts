/**
 * Swipe/button triage writes (`spec/tasks/16-swipe-triage.md` §2-4, FR-29).
 *
 * ARCHITECTURAL DECISION (task text explicitly invites one — "реши сам, как аккуратнее"):
 * this does NOT go through `answer.repository.ts#applyAnswer`. That function is the write
 * boundary for a *graded exercise answer* — it requires a `sessionId` (foreign key into
 * `sessions`, which a swipe never creates one of), appends a `ReviewLogRecord` with
 * `exerciseType`/`answerGiven`/`expected` fields that only make sense for an actual exercise
 * question, and bumps `dailyStats.reviewsCount`/`correctCount` — numbers `spec/app-design.md`
 * §5's "Сводка за сегодня" reads as "how many exercises did I answer today, how many right".
 * A swipe is neither: there was no question, no session, no right/wrong. Synthesizing a fake
 * `sessionId` and a `reviewLog` row with placeholder `answerGiven`/`expected` strings just to
 * satisfy `applyAnswer`'s shape would (a) pollute `reviewLogs` — read by FR-104's error
 * analysis and by `session-scope.ts#resolveMistakeScope` for the "Повторить только ошибки"
 * queue, neither of which should ever see a fabricated "answer" — and (b) silently inflate
 * the home screen's daily review count with actions that were never a review. Writing
 * directly to `skills` + `wordProgress` here (mirroring `skills.repository.ts#resetWord`'s
 * shape, which already does exactly this two-table pattern for the opposite operation) is
 * both simpler and more honest about what a swipe actually is.
 *
 * `computeWordProgress` (task 05, already exported for exactly this "hypothetical post-write
 * skill set" use case — see its own doc comment) runs OUTSIDE the write transaction because
 * it awaits `getParadigm`, which can hit the network (`content/loader.ts`, task 04) — holding
 * an IndexedDB `readwrite` transaction open across a `fetch()` is unsafe (see
 * `words-progress.repository.ts`'s file header for the same hazard). The actual `skills` +
 * `wordProgress` write is a single short, purely-Dexie transaction.
 *
 * Undo (task text §4: "Toast «Отменить» ... полностью откатывающий изменение — реальный
 * откат данных в Dexie") snapshots each touched skill's PREVIOUS row (or `undefined` if it
 * didn't exist yet — swiping a brand-new word materializes it, so undo must delete it again,
 * not leave a stray `new`-state row behind) plus the previous `wordProgress` row, taken right
 * before the write. `undoTriage` restores both verbatim inside one transaction.
 */
import { db } from '../database.ts'
import { createSwipeKnownState, createSwipeUnknownState } from '@/learning/srs/policy.ts'
import type { SrsState } from '@/learning/srs/srs.types.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import type { SkillRecord, WordProgressRecord } from '@/types/progress.ts'
import { getSkillsForWord } from './skills.repository.ts'
import { computeWordProgress, getWordProgress } from './words-progress.repository.ts'

export interface TriageSnapshot {
  readonly wordId: WordId
  readonly previousSkills: ReadonlyMap<SkillId, SkillRecord | undefined>
  readonly previousWordProgress: WordProgressRecord | undefined
}

/** One vocab dimension's target `SrsState` for this triage action. */
interface SkillPatch {
  readonly dimension: VocabDimension
  readonly srsState: SrsState
}

async function applyTriage(
  wordId: WordId,
  patches: readonly SkillPatch[],
): Promise<TriageSnapshot> {
  const currentSkills = await getSkillsForWord(wordId)
  const currentBySkillId = new Map(currentSkills.map((s) => [s.skillId, s]))

  const previousSkills = new Map<SkillId, SkillRecord | undefined>()
  const nextBySkillId = new Map(currentBySkillId)

  for (const patch of patches) {
    const skillId = encodeSkillId(wordId, patch.dimension)
    const previous = currentBySkillId.get(skillId)
    previousSkills.set(skillId, previous)

    const now = Date.now()
    const base: SkillRecord =
      previous ??
      ({
        skillId,
        wordId,
        kind: 'vocab',
        dimension: patch.dimension,
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
      } satisfies SkillRecord)

    nextBySkillId.set(skillId, { ...base, ...patch.srsState, updatedAt: now })
  }

  const previousWordProgress = await getWordProgress(wordId)
  const nextWordProgress = await computeWordProgress(wordId, [...nextBySkillId.values()])

  await db.transaction('rw', db.skills, db.wordProgress, async () => {
    for (const patch of patches) {
      const skillId = encodeSkillId(wordId, patch.dimension)
      await db.skills.put(nextBySkillId.get(skillId)!)
    }
    if (nextWordProgress === undefined) {
      await db.wordProgress.delete(wordId)
    } else {
      await db.wordProgress.put(nextWordProgress)
    }
  })

  return { wordId, previousSkills, previousWordProgress }
}

/**
 * Swipe-right / "Знаю" button (task text §2): `vocab:pl-ru` AND `vocab:ru-pl` both move to
 * FSRS `review` at `SWIPE_KNOWN_INITIAL_STABILITY` — see `policy.ts` for why that yields
 * word status `known`, never `mastered`.
 */
export async function markWordKnown(wordId: WordId, now = Date.now()): Promise<TriageSnapshot> {
  const srsState = createSwipeKnownState(now)
  return applyTriage(wordId, [
    { dimension: 'vocab:pl-ru', srsState },
    { dimension: 'vocab:ru-pl', srsState },
  ])
}

/**
 * Swipe-left / "Не знаю" button (task text §3): only `vocab:pl-ru` resets to a brand-new,
 * immediately-due skill, so the word surfaces in the next Learn queue build.
 */
export async function markWordUnknown(wordId: WordId, now = Date.now()): Promise<TriageSnapshot> {
  return applyTriage(wordId, [{ dimension: 'vocab:pl-ru', srsState: createSwipeUnknownState(now) }])
}

/** Fully reverts a `markWordKnown`/`markWordUnknown` write — restores every touched skill
 *  row to exactly what it was before (deleting it if it didn't exist yet) and the
 *  `wordProgress` row the same way. */
export async function undoTriage(snapshot: TriageSnapshot): Promise<void> {
  await db.transaction('rw', db.skills, db.wordProgress, async () => {
    for (const [skillId, record] of snapshot.previousSkills) {
      if (record === undefined) {
        await db.skills.delete(skillId)
      } else {
        await db.skills.put(record)
      }
    }
    if (snapshot.previousWordProgress === undefined) {
      await db.wordProgress.delete(snapshot.wordId)
    } else {
      await db.wordProgress.put(snapshot.previousWordProgress)
    }
  })
}
