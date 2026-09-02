/**
 * Orchestrates everything that has to happen before `SessionRunner` can render a single
 * exercise (`spec/tasks/13-session-runner.md` §1/§5): resolve the candidate pool for the
 * current `SessionScope` (`../lib/session-scope.ts`), offer to resume an abandoned session
 * (task text §5), build the `QueuePlan` (`@/learning/session/build-learn-queue.ts`), and
 * eagerly resolve it into real `ExerciseInstance`s (materializing `vocab:pl-ru` for brand-new
 * words along the way, `../lib/build-session-exercises.ts`).
 *
 * "Eagerly" (the whole queue up front, not lazily per-question) is a deliberate choice: it
 * keeps `SessionRunner` itself fully synchronous (no loading spinner between questions), and
 * a Learn queue is small (`targetSize`, default 20) — resolving 20 words' content and
 * `ensureSkill`-ing whichever are new costs at most 20 shard fetches, already deduplicated
 * by `content/loader.ts`'s per-shard cache, well within one screen's loading budget.
 */
import { useEffect, useRef, useState } from 'react'
import {
  completeSession,
  createSession,
  getSession,
} from '@/db/repositories/sessions.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { encodeSkillId } from '@/learning/skills/skill-id.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import { buildLearnQueue } from '@/learning/session/build-learn-queue.ts'
import type { ExerciseInstance } from '@/learning/exercises/exercise.types.ts'
import {
  NOUN_HINT_MODE_DEFAULT,
  NOUN_HINT_MODE_SETTING_KEY,
  type HintMode,
} from '@/learning/exercises/hint-mode.ts'
import type { Rating, SessionMode, SkillRecord } from '@/types/progress.ts'
import { getIncompleteSession } from '@/db/repositories/sessions.repository.ts'
import { useSessionStore } from '@/stores/session.store.ts'
import { SessionContentCache } from '../lib/session-content-context.ts'
import { generateForSkill, materializeQueueItem } from '../lib/build-session-exercises.ts'
import { resolveSessionCandidates, type SessionScope } from '../lib/session-scope.ts'

export interface SessionRuntime {
  readonly sessionId: number
  readonly mode: SessionMode
  readonly cache: SessionContentCache
  /** Populated as each queue item is resolved — reused by the mistake-requeue path so a
   *  retry never has to re-derive `enumerateSkills` for a word it already resolved. */
  readonly descriptors: Map<SkillId, SkillDescriptor>
  /** How many times each skill has been generated into an `ExerciseInstance` this session —
   *  starts at 0 for every item's first (initial-queue) generation, bumped before a
   *  mistake-requeue regenerates the same skill (`../lib/seed.ts`'s `attempt` parameter). */
  readonly attemptBySkillId: Map<SkillId, number>
  /** The `SkillRecord` each `ExerciseInstance` was generated against — `SessionRunner.tsx`
   *  needs this for `self-assess`'s interval preview (`previewIntervals(srsState, now)`,
   *  task 12's `SelfAssessExercise`), and the mistake-requeue path adds an entry for its
   *  freshly-generated retry instance too. Keyed by `ExerciseInstance.id`, not `skillId` —
   *  a retry is a *different* instance of the same skill with a possibly-different
   *  `SkillRecord` snapshot (the first attempt already updated it). */
  readonly skillByInstanceId: Map<string, SkillRecord>
  /** The noun form-exercise hint-mode setting (task 18, `learning/exercises/hint-mode.ts`),
   *  read once per session bootstrap (same convention as `targetSize`/`newWordsBudget` in
   *  `session-scope.ts`) and reused by every `generateForSkill` call this session makes —
   *  including `SessionRunner.tsx`'s mistake-requeue path, which reads it back off this
   *  runtime rather than re-reading `settings` a second time mid-session. */
  readonly hintMode: HintMode
}

export type BootstrapStatus =
  | { readonly phase: 'loading' }
  | {
      readonly phase: 'resume-prompt'
      readonly incompleteSessionId: number
      readonly answeredCount: number
    }
  | { readonly phase: 'empty' }
  | { readonly phase: 'ready'; readonly runtime: SessionRuntime }
  | { readonly phase: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Best-effort summary for a session that's being closed out *without* ever reaching the
 *  natural "queue emptied" path (task text §6: exiting still closes the session) —
 *  `newSkillCount` can't be reconstructed from `reviewLogs` alone (no `isNewSkill` column;
 *  see `answer-pipeline.ts`'s own header on why that flag only exists transiently at
 *  answer-time), so it's reported as `0` here. The natural-completion path in
 *  `SessionRunner.tsx` tracks it live instead and does not go through this function. */
function summarizeLogsForAbandonedSession(
  logs: { skillId: SkillId; correct: boolean; reviewedAt: number }[],
) {
  const firstLogBySkill = new Map<SkillId, { correct: boolean }>()
  for (const log of [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    if (!firstLogBySkill.has(log.skillId))
      firstLogBySkill.set(log.skillId, { correct: log.correct })
  }
  const totalCount = firstLogBySkill.size
  let correctCount = 0
  for (const { correct } of firstLogBySkill.values()) if (correct) correctCount++
  return { totalCount, correctCount, newSkillCount: 0, reviewedSkillCount: totalCount }
}

export function useSessionBootstrap(scope: SessionScope) {
  const [status, setStatus] = useState<BootstrapStatus>({ phase: 'loading' })
  // Guards against the mount effect's async work landing after unmount (StrictMode double
  // effect, or the user navigating away mid-load).
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  /**
   * `existingSessionId` is only set when resuming — a genuinely fresh start must NOT create
   * its `sessions` row until the plan is known to be non-empty (bug found during manual
   * verification: creating the row up front, before knowing whether `buildLearnQueue` would
   * come back empty, left a permanently-incomplete orphan session behind every time a
   * word-scoped "Учить" landed on `acceptance point 10`'s empty-queue case — the very next
   * `/session` visit would then wrongly offer to "resume" that empty, answer-less session
   * instead of building the caller's actual request). A *resumed* session that turns out
   * empty on rebuild (e.g. every remaining item got excluded) is closed out via
   * `completeSession` here instead, for the same reason: it must not linger as
   * "incomplete" either.
   */
  async function buildAndStart(args: {
    existingSessionId?: number
    mode: SessionMode
    excludeSkillIds: ReadonlySet<SkillId>
    prefillFirstAnswers: ReadonlyMap<SkillId, Rating>
  }) {
    const now = Date.now()
    const [candidates, hintMode] = await Promise.all([
      resolveSessionCandidates(scope, now),
      settingsRepo.get<HintMode>(NOUN_HINT_MODE_SETTING_KEY, NOUN_HINT_MODE_DEFAULT),
    ])

    const dueSkills = candidates.dueSkills.filter((s) => !args.excludeSkillIds.has(s.skillId))
    const candidateNewWords = candidates.candidateNewWords.filter(
      (w) => !args.excludeSkillIds.has(encodeSkillId(`${w.lemma}|${w.pos}`, 'vocab:pl-ru')),
    )

    const plan = buildLearnQueue({
      now,
      dueSkills,
      newWordsBudget: candidates.newWordsBudget,
      candidateNewWords,
      targetSize: candidates.targetSize,
    })

    if (!aliveRef.current) return
    if (plan.items.length === 0) {
      if (args.existingSessionId !== undefined) {
        const logs = await getLogsForSession(args.existingSessionId)
        await completeSession(args.existingSessionId, now, summarizeLogsForAbandonedSession(logs))
      }
      if (aliveRef.current) setStatus({ phase: 'empty' })
      return
    }

    const sessionId = args.existingSessionId ?? (await createSession(args.mode, now))

    const cache = new SessionContentCache()
    const descriptors = new Map<SkillId, SkillDescriptor>()
    const skillByInstanceId = new Map<string, SkillRecord>()
    const instances: ExerciseInstance[] = []
    for (const item of plan.items) {
      const { descriptor, skill } = await materializeQueueItem(item, cache)
      descriptors.set(descriptor.skillId, descriptor)
      const instance = generateForSkill(descriptor, skill, cache, 0, hintMode)
      skillByInstanceId.set(instance.id, skill)
      instances.push(instance)
    }
    if (!aliveRef.current) return

    useSessionStore.getState().startSession({ sessionId, mode: args.mode, queue: instances })
    if (args.prefillFirstAnswers.size > 0) {
      useSessionStore.getState().seedFirstAnswers(args.prefillFirstAnswers)
    }

    const attemptBySkillId = new Map<SkillId, number>()
    for (const descriptor of descriptors.values()) attemptBySkillId.set(descriptor.skillId, 0)

    setStatus({
      phase: 'ready',
      runtime: {
        sessionId,
        mode: args.mode,
        cache,
        descriptors,
        attemptBySkillId,
        skillByInstanceId,
        hintMode,
      },
    })
  }

  async function startFresh() {
    setStatus({ phase: 'loading' })
    try {
      // Task 14: the one scope that isn't a Learn queue in disguise — `SessionResultPage`'s
      // "Разобрать ошибки" always launches `{ kind: 'mistake' }`, and that scope has no
      // other reason to exist than starting a `mode: 'mistakes'` session (see
      // `session-scope.ts`'s own header). Every other scope keeps today's `'learn'` default —
      // including task 17's `{ kind: 'skill' }` (a declension-table cell click): that one
      // must land here in `'learn'`, not `'mistakes'`, precisely so its SRS update is not
      // suppressed (see `session-scope.ts`'s `resolveSkillScope` doc comment).
      const mode: SessionMode = scope.kind === 'mistake' ? 'mistakes' : 'learn'
      await buildAndStart({ mode, excludeSkillIds: new Set(), prefillFirstAnswers: new Map() })
    } catch (error: unknown) {
      if (aliveRef.current) setStatus({ phase: 'error', message: errorMessage(error) })
    }
  }

  async function resumeIncomplete(incompleteSessionId: number) {
    setStatus({ phase: 'loading' })
    try {
      const [session, logs] = await Promise.all([
        getSession(incompleteSessionId),
        getLogsForSession(incompleteSessionId),
      ])
      const excludeSkillIds = new Set(logs.map((l) => l.skillId))
      const prefillFirstAnswers = new Map(logs.map((l) => [l.skillId, l.rating] as const))
      await buildAndStart({
        existingSessionId: incompleteSessionId,
        mode: session?.mode ?? 'learn',
        excludeSkillIds,
        prefillFirstAnswers,
      })
    } catch (error: unknown) {
      if (aliveRef.current) setStatus({ phase: 'error', message: errorMessage(error) })
    }
  }

  async function abandonAndStartFresh(incompleteSessionId: number) {
    setStatus({ phase: 'loading' })
    try {
      const logs = await getLogsForSession(incompleteSessionId)
      await completeSession(incompleteSessionId, Date.now(), summarizeLogsForAbandonedSession(logs))
      await startFresh()
    } catch (error: unknown) {
      if (aliveRef.current) setStatus({ phase: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const incomplete = await getIncompleteSession()
        if (cancelled) return
        if (incomplete?.id !== undefined) {
          const logs = await getLogsForSession(incomplete.id)
          if (cancelled) return
          setStatus({
            phase: 'resume-prompt',
            incompleteSessionId: incomplete.id,
            answeredCount: new Set(logs.map((l) => l.skillId)).size,
          })
          return
        }
        await startFresh()
      } catch (error: unknown) {
        if (!cancelled) setStatus({ phase: 'error', message: errorMessage(error) })
      }
    })()
    return () => {
      cancelled = true
    }
    // Deliberately runs once: the scope resolved from `location.state` at mount time is
    // fixed for the lifetime of one `/session` visit (mirrors `useDueCount`'s "capture once"
    // rationale) — re-resolving on every scope-identity change would restart a session the
    // user may already be answering questions in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status, resumeIncomplete, abandonAndStartFresh, retry: startFresh }
}
