/**
 * The daily session's own "Сопоставление" block (`spec/tasks/40-vocab-streak-progression.md`
 * §4) — a `matching`-typed `ExerciseInstance` `useSessionBootstrap.ts` inserts into the
 * ordinary Learn queue, built from words OUTSIDE that queue
 * (`session-scope.ts#resolveSessionMatchingWordIds`). Wraps the same `MatchingExercise` grid
 * the standalone `/practice/matching` screen uses, grading each correct pairing via the same
 * `gradeMatchingPair` (task 39's dual-direction grading, task 36's ungraded-tail rule via
 * `shouldGradeMatch`) — the only real difference from the standalone screen is where the
 * graded skills end up: this session's own live `useSessionStore` state, not a screen of its
 * own with its own `completeSession` call.
 *
 * `SessionRunner.tsx` renders this INSTEAD OF `ActiveQuestion` for a `matching`-typed queue
 * item — a matching grid is a whole multi-pair screen with no single "the" answer, not a
 * one-`onAnswer` question, so (same reasoning as the Practice-only `table` type —
 * `exercise-registry.tsx`'s own header) it never goes through that registry's per-type
 * dispatch at all.
 *
 * `seedFirstAnswers`/`newSkillIdsRef` after each graded pairing: `submitAnswer` (inside
 * `gradeMatchingPair`) already durably writes `skills`/`reviewLogs`/`wordProgress` — this only
 * mirrors that into the session's OWN live bookkeeping (`firstAnswerBySkill`, `newSkillIds`),
 * the same two things `SessionRunner.tsx#ActiveQuestion`'s `handleAnswer` updates after every
 * ordinary answer, so this block's pairs count toward the session summary
 * (`summarizeSession`) exactly like any other graded skill.
 */
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Exercise, ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import { shouldGradeMatch } from '@/learning/practice/lexical-batch.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import { useSessionStore } from '@/stores/session.store.ts'
import { gradeMatchingPair } from '../lib/grade-matching-pair.ts'
import { MatchingExercise } from './MatchingExercise.tsx'

export interface SessionMatchingBlockProps {
  /** Must have `exercise.type === 'matching'` — checked once, after this component's own
   *  hooks (same "hooks first, invariant check after" convention `ActiveQuestion` in
   *  `SessionRunner.tsx` uses for its own `SkillDescriptor` lookup), never in practice
   *  reachable any other way: `SessionRunner.tsx` only ever mounts this component for a
   *  queue item its own `currentInstance.exercise.type === 'matching'` check already
   *  confirmed. */
  readonly instance: ExerciseInstance
  readonly sessionId: number
  readonly newSkillIdsRef: RefObject<Set<SkillId>>
}

export function SessionMatchingBlock({ instance, sessionId, newSkillIdsRef }: SessionMatchingBlockProps) {
  // Lazy initializer -> runs exactly once, at mount — same pattern (and same
  // `react-hooks/purity` rationale) as `ActiveQuestion`'s own `questionShownAt`.
  const [shownAt] = useState(() => Date.now())
  const matchIndexRef = useRef(0)
  const doneRef = useRef(false)

  if (instance.exercise.type !== 'matching') {
    throw new Error(
      `SessionMatchingBlock: expected a "matching" exercise, got "${instance.exercise.type}"`,
    )
  }
  const exercise: Extract<Exercise, { type: 'matching' }> = instance.exercise

  async function handlePairMatched(wordId: WordId) {
    // Task 36 §4 — the last `MATCHING_UNGRADED_TAIL` correct pairings of the batch are a
    // guess, not knowledge (`lexical-batch.ts`'s own header): count this pairing, but never
    // call `gradeMatchingPair` for it. `matchIndexRef` is 0-based, exactly `shouldGradeMatch`'s
    // `matchIndex` contract.
    const matchIndex = matchIndexRef.current
    matchIndexRef.current += 1
    if (!shouldGradeMatch(matchIndex, exercise.pairs.length)) return

    const pair = exercise.pairs.find((p) => p.wordId === wordId)
    if (!pair) return // defensive — MatchingExercise only ever reports a wordId of its own pairs

    const elapsedMs = Math.max(0, Date.now() - shownAt)
    const now = Date.now()
    const result = await gradeMatchingPair({ sessionId, mode: 'practice', pair, elapsedMs, now })

    const store = useSessionStore.getState()
    store.seedFirstAnswers(new Map(result.skills.map((s) => [s.skillId, s.rating])))
    for (const graded of result.skills) {
      if (graded.isNewSkill) newSkillIdsRef.current?.add(graded.skillId)
    }
  }

  // "Готово" (`MatchingExercise`'s own button, shown once every pair is matched) advances the
  // live queue to whatever comes next — this block never calls `completeSession`/
  // `deleteSession` itself, unlike the standalone `/practice/matching` screen's own `finish()`:
  // the surrounding Learn session's own "queue emptied" effect (`SessionRunner.tsx`) already
  // owns that.
  function handleDone() {
    if (doneRef.current) return
    doneRef.current = true
    useSessionStore.getState().advance()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Сопоставление — соедините польские слова с их переводами.
      </p>
      <MatchingExercise pairs={exercise.pairs} onPairMatched={handlePairMatched} onDone={handleDone} />
    </div>
  )
}
