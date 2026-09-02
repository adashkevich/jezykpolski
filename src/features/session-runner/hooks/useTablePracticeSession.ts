/**
 * Bootstraps the `table` exercise (`spec/tasks/18-noun-exercises.md` step 4, FR-62) for one
 * NOUN word — the "Тренировать таблицей" entry point on `NounFormsTable.tsx`.
 *
 * Deliberately NOT built on `useSessionBootstrap.ts`/`SessionRunner.tsx`'s queue machinery,
 * even though both already support `mode: 'practice'` end to end (`answer-pipeline.ts`'s
 * `submitAnswer` already applies `capRatingForMode`/`applyPracticeDamping` for any mode it's
 * called with). That machinery is built entirely around ONE `ExerciseInstance` = ONE
 * `onAnswer` = ONE skill at a time (`ExerciseProps<E>`'s contract, `exercise-props.types.ts`)
 * — a `table` exercise is the opposite shape: one screen, ~12 independently-answerable
 * cells, each its own skill, all visible and editable at once. Retrofitting that into
 * `SessionRunner.tsx`'s single-`feedback`/single-`onNext` loop would mean rewriting its core
 * assumptions (session-store `firstAnswerBySkill` keyed by one skill, the mistake-requeue
 * path, `ExerciseFeedback`'s one-`correctAnswer` banner) for a UI pattern that appears
 * exactly once in the whole app. A small, self-contained hook that reuses the same lower-level
 * building blocks (`SessionContentCache`, `submitAnswer`, `createSession`/`completeSession`/
 * `deleteSession`) directly is simpler and carries far less risk of regressing the queue-based
 * flow every other exercise type depends on. Documented here as this task's own decision,
 * since the task text explicitly left the exact mechanism up to this task to choose.
 *
 * Session bookkeeping mirrors `SessionRunner.tsx`'s own `writeSessionRecord`: a table run
 * that ends with zero graded cells (opened, then abandoned) is deleted rather than left as a
 * permanent zeroed row (`deleteSession`, same convention as task 14 acceptance point 8);
 * otherwise `completeSession` is called exactly once, however the run ends (every cell
 * graded, or the user leaves early) — `finish()` is idempotent via `finishedRef`.
 */
import { useEffect, useRef, useState } from 'react'
import { generateTableExercise } from '@/learning/exercises/generate.ts'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { completeSession, createSession, deleteSession } from '@/db/repositories/sessions.repository.ts'
import { SessionContentCache } from '../lib/session-content-context.ts'

export type TableExerciseData = Extract<Exercise, { type: 'table' }>

export type TablePracticeStatus =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly sessionId: number; readonly exercise: TableExerciseData }
  | { readonly phase: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface TablePracticeSession {
  readonly status: TablePracticeStatus
  /** Call once per cell, right after `submitAnswer` resolves for it — tallies the running
   *  session summary `finish()` writes. */
  recordCellResult(result: { readonly correct: boolean; readonly isNewSkill: boolean }): void
  /** Closes out the session (`completeSession`/`deleteSession`) exactly once. Safe to call
   *  more than once (e.g. both an explicit "Готово" click and the unmount cleanup below) —
   *  every call after the first is a no-op. */
  finish(): Promise<void>
}

export function useTablePracticeSession(wordId: WordId): TablePracticeSession {
  const [status, setStatus] = useState<TablePracticeStatus>({ phase: 'loading' })
  const sessionIdRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const tallyRef = useRef({ total: 0, correct: 0, newSkillCount: 0 })
  const aliveRef = useRef(true)

  // A new `wordId` (the route param changed while this hook's caller stays mounted) resets
  // back to `loading` synchronously during render — React's own "adjusting state when a prop
  // changes" pattern, same as `useLazyParadigm.ts`'s `lastSeenWordId` check — rather than a
  // `setStatus` call at the top of the effect below, which `react-hooks/set-state-in-effect`
  // (an *error* in this repo's lint config) forbids.
  const [lastWordId, setLastWordId] = useState(wordId)
  if (wordId !== lastWordId) {
    setLastWordId(wordId)
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
        const exercise = generateTableExercise(wordId, cache.toContentContext())
        if (exercise.type !== 'table') {
          // Unreachable — `generateTableExercise` always returns a `table` exercise — kept
          // as a defensive narrowing so `status.exercise` below is typed as `TableExerciseData`
          // without a cast.
          throw new Error('useTablePracticeSession: generateTableExercise returned a non-table exercise')
        }
        const sessionId = await createSession('practice', Date.now())
        // Tracked before the `aliveRef` check, regardless of outcome: if the component
        // already unmounted while `createSession` was in flight, the cleanup below already
        // ran `finish()` once (a no-op then, since this ref was still `null`) — recording the
        // id now and immediately re-running `finish()` is what actually closes out (deletes,
        // since nothing was ever graded) the row `createSession` just wrote, instead of
        // leaving it as a permanent orphaned "incomplete" session.
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
      // Best-effort close-out on unmount (navigating away without an explicit "Готово") —
      // fire-and-forget is acceptable here, same as any other cleanup-time write: there is
      // no UI left to report a failure to, and a stray incomplete `sessions` row is exactly
      // what `getIncompleteSession`'s resume-prompt (task 13) already knows how to recover
      // from on the next `/session` visit, same as an abandoned Learn session.
      void finish()
    }
  }, [wordId])

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
