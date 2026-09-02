/**
 * Bootstraps the `matching` exercise (`spec/tasks/27-context-and-error-analysis.md` §4,
 * FR-55) for a BATCH of 5 vocab words — the "Сопоставление" entry point on
 * `TrainingSetupScreen`. Copies `useTablePracticeSession.ts`'s own pattern literally (same
 * file header rationale applies verbatim: one screen with several independently-graded
 * skills at once doesn't fit `ExerciseProps<E>`'s one-`onAnswer` contract, so this is a
 * small, self-contained hook built directly on `SessionContentCache`/`submitAnswer`/
 * `createSession`/`completeSession`/`deleteSession` rather than another `SessionRunner`
 * registry entry) — the one structural difference is 5 words instead of 1, so `finish()`
 * tallies across all 5 pairs instead of ~12 table cells.
 *
 * Grading model (this task's own decision, since the task text leaves "точный UI матрицы
 * путаницы... точный механизм" for other pieces open but says nothing about matching's own
 * wrong-answer bookkeeping beyond "видимая обратная связь по каждой паре"): a WRONG
 * PL-tile/RU-tile pairing is transient UI feedback only (flash + deselect, `MatchingExercise
 * .tsx`'s own concern) — it is never logged to `reviewLogs`, because a mismatch consumes one
 * tile from each of TWO different words at once, and there is no principled way to decide
 * which of the two "owns" that wrong attempt without double-counting or picking arbitrarily.
 * Only a CORRECT pairing is graded, via `submitAnswer` with a synthetic single-slot `choice`
 * exercise (`direction: 'pl-ru'`, `correct` = that word's own primary translation) — exactly
 * the "each pair graded independently, same submitAnswer call TableExercise already makes
 * per cell" the task text asks for, just always on the winning attempt.
 */
import { useEffect, useRef, useState } from 'react'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, type WordId } from '@/learning/skills/skill-id.ts'
import { completeSession, createSession, deleteSession } from '@/db/repositories/sessions.repository.ts'
import { submitAnswer } from '../lib/answer-pipeline.ts'
import { SessionContentCache } from '../lib/session-content-context.ts'

export type MatchingExerciseData = Extract<Exercise, { type: 'matching' }>

export interface MatchingPairSource {
  readonly wordId: WordId
  readonly pl: string
  readonly ru: string
}

export type MatchingPracticeStatus =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly sessionId: number; readonly pairs: readonly MatchingPairSource[] }
  | { readonly phase: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface MatchingPracticeSession {
  readonly status: MatchingPracticeStatus
  /** Grades exactly one CORRECT pairing (see this module's header for why wrong pairings
   *  never reach this) — `wordId` identifies which pair; elapsed time is measured from when
   *  the batch was shown to when this resolves. */
  gradePair(wordId: WordId): Promise<void>
  finish(): Promise<void>
}

export function useMatchingPracticeSession(wordIds: readonly WordId[]): MatchingPracticeSession {
  const [status, setStatus] = useState<MatchingPracticeStatus>({ phase: 'loading' })
  const sessionIdRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const tallyRef = useRef({ total: 0, correct: 0, newSkillCount: 0 })
  const aliveRef = useRef(true)
  const cacheRef = useRef<SessionContentCache | null>(null)
  const pairsByWordIdRef = useRef(new Map<WordId, MatchingPairSource>())
  // Set once the batch is shown (inside the effect below, never during render — the
  // `react-hooks/purity` rule this codebase enforces forbids calling `Date.now()` directly
  // in a component's render body, even from a plain helper function it might call; reading
  // elapsed time here (an ordinary hook, not a component) and inside `gradePair` (an
  // `async function`, exempt the same way `TableExercise.tsx#gradeCell`'s own `Date.now()`
  // call already is) keeps `MatchingExercise.tsx` itself free of any impure call).
  const shownAtRef = useRef(0)

  useEffect(() => {
    aliveRef.current = true
    finishedRef.current = false
    sessionIdRef.current = null
    tallyRef.current = { total: 0, correct: 0, newSkillCount: 0 }

    ;(async () => {
      try {
        if (wordIds.length === 0) {
          throw new Error('useMatchingPracticeSession: no words provided')
        }
        const cache = new SessionContentCache()
        await Promise.all(wordIds.map((wordId) => cache.preload(wordId)))
        cacheRef.current = cache
        const ctx = cache.toContentContext()

        const pairs: MatchingPairSource[] = wordIds.map((wordId) => ({
          wordId,
          pl: ctx.getWordEntry(wordId).lemma,
          ru: ctx.getPrimaryTranslation(wordId),
        }))
        pairsByWordIdRef.current = new Map(pairs.map((p) => [p.wordId, p]))
        shownAtRef.current = Date.now()

        const sessionId = await createSession('practice', Date.now())
        sessionIdRef.current = sessionId
        if (!aliveRef.current) {
          void finish()
          return
        }
        setStatus({ phase: 'ready', sessionId, pairs })
      } catch (error: unknown) {
        if (aliveRef.current) setStatus({ phase: 'error', message: errorMessage(error) })
      }
    })()

    return () => {
      aliveRef.current = false
      void finish()
    }
    // `wordIds` is captured once per mount (the batch for this one `/practice/matching`
    // visit) — same "capture once" convention as every other session-scoped hook in this
    // feature (`useSessionBootstrap.ts`'s own header states the same rule).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function gradePair(wordId: WordId): Promise<void> {
    const cache = cacheRef.current
    const sessionId = sessionIdRef.current
    const pair = pairsByWordIdRef.current.get(wordId)
    if (!cache || sessionId === null || !pair) return
    const elapsedMs = Math.max(0, Date.now() - shownAtRef.current)

    const skillId = encodeSkillId(wordId, 'vocab:pl-ru')
    const skill = await ensureSkill(skillId, wordId, 'vocab', 'vocab:pl-ru')

    const exercise: Exercise = {
      type: 'choice',
      direction: 'pl-ru',
      prompt: pair.pl,
      options: [pair.ru],
      correct: pair.ru,
    }

    const result = await submitAnswer({
      sessionId,
      mode: 'practice',
      exercise,
      skillId,
      wordId,
      kind: 'vocab',
      answerGiven: pair.ru,
      isFirstAnswerInSession: skill.reps === 0,
      elapsedMs,
      now: Date.now(),
    })

    tallyRef.current.total += 1
    tallyRef.current.correct += 1 // only correct pairings ever reach this function
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

  return { status, gradePair, finish }
}
