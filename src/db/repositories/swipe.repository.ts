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
import {
  createSwipeUnknownState,
  isAtOrAboveSwipeKnownFloor,
  resolveSwipeKnownState,
  resolveSwipeUnlockedState,
} from '@/learning/srs/policy.ts'
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

/** One vocab dimension's target `SrsState` for this triage action. `srsState` may be a
 *  resolver function instead of a plain value when the target state depends on what's
 *  already there (e.g. `markWordKnown`'s monotonic guard, `policy.ts#resolveSwipeKnownState`) —
 *  `applyTriage` calls it with the dimension's existing `SkillRecord` (`undefined` if none). */
interface SkillPatch {
  readonly dimension: VocabDimension
  readonly srsState: SrsState | ((previous: SkillRecord | undefined) => SrsState)
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

    const resolvedSrsState =
      typeof patch.srsState === 'function' ? patch.srsState(previous) : patch.srsState

    nextBySkillId.set(skillId, { ...base, ...resolvedSrsState, updatedAt: now })
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
 * Swipe-right / "Знаю" button (task text §2): all three vocab dimensions (`vocab:pl-ru`,
 * `vocab:ru-pl-choice`, `vocab:ru-pl-input` — task 37 widened this from two to three when the
 * middle recognition-of-Polish stage was added) move to FSRS `review` at
 * `SWIPE_KNOWN_INITIAL_STABILITY` — see `policy.ts` for why that yields word status `known`,
 * never `mastered`. Each dimension is resolved independently against its own existing record
 * (`policy.ts#resolveSwipeKnownState`) so a skill that already has real review history at or
 * above that floor is never dragged back down to it.
 */
export async function markWordKnown(wordId: WordId, now = Date.now()): Promise<TriageSnapshot> {
  const resolve = (previous: SkillRecord | undefined) => resolveSwipeKnownState(previous, now)
  return applyTriage(wordId, [
    { dimension: 'vocab:pl-ru', srsState: resolve },
    { dimension: 'vocab:ru-pl-choice', srsState: resolve },
    { dimension: 'vocab:ru-pl-input', srsState: resolve },
  ])
}

/**
 * "Знаю" button on a Learn-session `vocab:pl-ru` / `vocab:ru-pl-choice` question
 * (`SessionRunner.tsx`), task 40 §3 (`spec/tasks/40-vocab-streak-progression.md`):
 * the same monotonic known-state as `markWordKnown` for the two choice stages, PLUS — this is
 * what changed from task 37's original version — opens `vocab:ru-pl-input` too, via
 * `resolveSwipeUnlockedState` rather than `resolveSwipeKnownState`: pressing "Знаю" on a
 * translation question should make the word start appearing as a typing exercise, without
 * the button itself asserting the word is already known well enough to type
 * (`stage.ts#hasGraduatedProduction` still requires a real graded `input` answer for that —
 * see `resolveSwipeUnlockedState`'s own doc comment). The normal path — a graded
 * `vocab:ru-pl-choice` answer clearing `stage.ts#shouldUnlockProduction`,
 * `answer-pipeline.ts#unlockNextVocabStage` — still exists and still fires on its own; this
 * button is a second, explicit way to reach the same open-but-not-yet-earned state.
 */
export async function markWordTranslationKnown(
  wordId: WordId,
  now = Date.now(),
): Promise<TriageSnapshot> {
  const resolveKnown = (previous: SkillRecord | undefined) => resolveSwipeKnownState(previous, now)
  const resolveUnlocked = (previous: SkillRecord | undefined) =>
    resolveSwipeUnlockedState(previous, now)
  return applyTriage(wordId, [
    ...CHOICE_STAGE_DIMENSIONS.map((dimension) => ({ dimension, srsState: resolveKnown })),
    { dimension: 'vocab:ru-pl-input', srsState: resolveUnlocked },
  ])
}

/** The two vocab stages `markWordTranslationKnown` marks known (`vocab:ru-pl-input` is
 *  handled separately — see that function's own doc comment for why it's `resolveSwipeUnlockedState`,
 *  not `resolveSwipeKnownState`). */
export const CHOICE_STAGE_DIMENSIONS = [
  'vocab:pl-ru',
  'vocab:ru-pl-choice',
] as const satisfies readonly VocabDimension[]

/**
 * Whether `markWordTranslationKnown` would be a complete no-op: both choice stages already at
 * or above the known floor AND `vocab:ru-pl-input` already materialized (task 40 §3 — once the
 * record exists, `resolveSwipeUnlockedState` never touches it again, so re-pressing the
 * button afterward would change nothing there either). The session hides its "Знаю" button in
 * that case instead of offering one that does nothing.
 */
export async function areChoiceStagesKnown(wordId: WordId): Promise<boolean> {
  const skills = await getSkillsForWord(wordId)
  const choiceStagesKnown = CHOICE_STAGE_DIMENSIONS.every((dimension) =>
    isAtOrAboveSwipeKnownFloor(skills.find((s) => s.dimension === dimension)),
  )
  const inputOpened = skills.some((s) => s.dimension === 'vocab:ru-pl-input')
  return choiceStagesKnown && inputOpened
}

/**
 * Swipe-left / "Не знаю" button (task text §3): only `vocab:pl-ru` resets to a brand-new,
 * immediately-due skill, so the word surfaces in the next Learn queue build.
 */
export async function markWordUnknown(wordId: WordId, now = Date.now()): Promise<TriageSnapshot> {
  return applyTriage(wordId, [{ dimension: 'vocab:pl-ru', srsState: createSwipeUnknownState(now) }])
}

/**
 * "Не учить" button (`spec/design/word-noun.png`'s word-detail card): removes this word from
 * the Learn/Practice queues by deleting its three `vocab:*` skills outright, rather than
 * resetting them to a fresh `new` state the way `markWordUnknown` does — a fresh `new` skill
 * is exactly what makes a word due again, the opposite of what this button promises. This is
 * a genuinely different write shape from `applyTriage` above (which only ever puts records,
 * never deletes), so it isn't built on that helper — it uses the same `[wordId+kind]` compound
 * index `resetWord` (`skills.repository.ts`) reads, scoped to `kind: 'vocab'` so any `noun:*`/
 * `verb:*`/etc. skills the word also has are left untouched.
 *
 * Deleting the vocab skills is NOT the same as excluding the word forever: with zero recorded
 * skills the word's aggregate status reads back as `'new'`
 * (`learning/progress/aggregate.ts#aggregateWord`), so it can resurface as a new-word candidate
 * in a later session. That's an accepted tradeoff, not an oversight — there is deliberately no
 * separate "excluded" flag on the word/progress record.
 *
 * Returns a `TriageSnapshot` so the caller's undo path is `undoTriage`, unchanged — the
 * snapshot shape (previous per-skill records, `undefined` where a skill didn't exist) already
 * expresses "put these back or delete them" regardless of whether the original write put or
 * deleted.
 */
export async function forgetWordVocab(wordId: WordId): Promise<TriageSnapshot> {
  const currentSkills = await getSkillsForWord(wordId)
  const vocabSkills = currentSkills.filter((s) => s.kind === 'vocab')

  const previousSkills = new Map<SkillId, SkillRecord | undefined>(
    vocabSkills.map((s) => [s.skillId, s] as const),
  )
  const remainingSkills = currentSkills.filter((s) => s.kind !== 'vocab')

  const previousWordProgress = await getWordProgress(wordId)
  const nextWordProgress = await computeWordProgress(wordId, remainingSkills)

  await db.transaction('rw', db.skills, db.wordProgress, async () => {
    for (const skillId of previousSkills.keys()) {
      await db.skills.delete(skillId)
    }
    if (nextWordProgress === undefined) {
      await db.wordProgress.delete(wordId)
    } else {
      await db.wordProgress.put(nextWordProgress)
    }
  })

  return { wordId, previousSkills, previousWordProgress }
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
