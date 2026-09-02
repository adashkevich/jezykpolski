/**
 * Bootstraps the `table` exercise for ONE VERB tense/mood (`spec/tasks/21-verb-exercises.md`
 * step 5) — the "Тренировать таблицей" entry point on each `VerbFormsTable.tsx` tab.
 *
 * A near-mirror of `useTablePracticeSession.ts` (the NOUN table's own hook), calling
 * `generateVerbTableExercise(wordId, tense, ctx)` instead of `generateTableExercise(wordId,
 * ctx)` — every other piece (`SessionContentCache`, `createSession`/`completeSession`/
 * `deleteSession`, the running tally, the finish()-is-idempotent contract) is identical.
 *
 * Decision (task text explicitly leaves the mechanism up to this task, and asks for the
 * choice to be justified): a SEPARATE hook, not a generalized `useTablePracticeSession`
 * parameterized by a `buildExercise` callback. Reusing one hook would mean threading a
 * closure through the `useEffect` dependency array — either it's a fresh function identity
 * every render (an infinite-effect-rerun bug, or an `eslint-disable` for
 * `react-hooks/exhaustive-deps`) or every call site has to `useCallback`-wrap its own
 * generator, which leaks this hook's internal shape into both `TablePracticePage.tsx` (NOUN,
 * already shipped, task 18, and NOT to be touched by this task) and the new VERB page. The
 * actual duplicated code here is ~15 lines of mechanical session bookkeeping — not the real
 * logic, which already lives once each in `generateVerbTableExercise`/`generateTableExercise`
 * (content -> `Exercise`) and `submitAnswer`/`ensureSkill` (grading) — so the duplication
 * risk this would guard against is small, while the coupling risk of generalizing is not.
 */
import { useEffect, useRef, useState } from 'react'
import { generateVerbTableExercise, type VerbTableTense } from '@/learning/exercises/generate.ts'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { completeSession, createSession, deleteSession } from '@/db/repositories/sessions.repository.ts'
import { SessionContentCache } from '../lib/session-content-context.ts'

export type VerbTableExerciseData = Extract<Exercise, { type: 'table' }>

export type VerbTablePracticeStatus =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly sessionId: number; readonly exercise: VerbTableExerciseData }
  | { readonly phase: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface VerbTablePracticeSession {
  readonly status: VerbTablePracticeStatus
  recordCellResult(result: { readonly correct: boolean; readonly isNewSkill: boolean }): void
  finish(): Promise<void>
}

export function useVerbTablePracticeSession(
  wordId: WordId,
  tense: VerbTableTense,
): VerbTablePracticeSession {
  const [status, setStatus] = useState<VerbTablePracticeStatus>({ phase: 'loading' })
  const sessionIdRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const tallyRef = useRef({ total: 0, correct: 0, newSkillCount: 0 })
  const aliveRef = useRef(true)

  // Same "adjust state during render" pattern `useTablePracticeSession.ts` uses — a changed
  // `wordId` OR `tense` (the route params changed while this hook's caller stays mounted,
  // e.g. switching tabs) resets back to `loading` synchronously during render, never via a
  // `setState` call inside the effect (forbidden by this repo's `react-hooks/set-state-in-effect`).
  const [lastKey, setLastKey] = useState(`${wordId}::${tense}`)
  const key = `${wordId}::${tense}`
  if (key !== lastKey) {
    setLastKey(key)
    setStatus({ phase: 'loading' })
  }

  useEffect(() => {
    aliveRef.current = true
    finishedRef.current = false
    sessionIdRef.current = null
    tallyRef.current = { total: 0, correct: 0, newSkillCount: 0 }

    ;(async () => {
      try {
        const cache = new SessionContentCache()
        await cache.preload(wordId)
        const exercise = generateVerbTableExercise(wordId, tense, cache.toContentContext())
        if (exercise.type !== 'table') {
          // Unreachable — `generateVerbTableExercise` always returns a `table` exercise —
          // kept as a defensive narrowing, same as `useTablePracticeSession.ts`.
          throw new Error(
            'useVerbTablePracticeSession: generateVerbTableExercise returned a non-table exercise',
          )
        }
        const sessionId = await createSession('practice', Date.now())
        sessionIdRef.current = sessionId
        if (!aliveRef.current) {
          void finish()
          return
        }
        setStatus({ phase: 'ready', sessionId, exercise })
      } catch (error: unknown) {
        if (aliveRef.current) setStatus({ phase: 'error', message: errorMessage(error) })
      }
    })()

    return () => {
      aliveRef.current = false
      void finish()
    }
  }, [wordId, tense])

  function recordCellResult(result: { readonly correct: boolean; readonly isNewSkill: boolean }) {
    tallyRef.current.total += 1
    if (result.correct) tallyRef.current.correct += 1
    if (result.isNewSkill) tallyRef.current.newSkillCount += 1
  }

  async function finish(): Promise<void> {
    if (finishedRef.current) return
    const sessionId = sessionIdRef.current
    if (sessionId === null) return
    finishedRef.current = true

    const { total, correct, newSkillCount } = tallyRef.current
    if (total === 0) {
      await deleteSession(sessionId)
      return
    }
    await completeSession(sessionId, Date.now(), {
      totalCount: total,
      correctCount: correct,
      newSkillCount,
      reviewedSkillCount: total - newSkillCount,
    })
  }

  return { status, recordCellResult, finish }
}
