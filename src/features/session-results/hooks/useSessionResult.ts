/**
 * Loads everything `SessionResultPage` needs to render `/session/result`
 * (`spec/tasks/14-session-results.md` §1/§4): the finished session's own `SessionRecord`
 * (for `newSkillCount`/`reviewedSkillCount`, which `build-session-summary.ts` can't
 * reconstruct from `reviewLogs` alone) plus its logs, reduced to a `SessionSummaryView` via
 * the pure `buildSessionSummary`.
 *
 * `sessionId` comes from `location.state` (`SessionRunner.tsx`'s `onFinished` hands it to
 * `SessionPage#goToResults`, which puts it there) — there is no other channel: the active
 * session's own Zustand state (`stores/session.store.ts`) is already `reset()` by the time
 * this page mounts (architecture.md §10: it never persists across a session boundary).
 *
 * Task 14 acceptance point 8 ("сессия с нулём ответов не создаёт мусорную запись, не
 * показывать экран результатов"): `sessionId === undefined` (no state — e.g. a direct URL
 * visit) OR a `sessionId` that no longer resolves to a session (already deleted, or simply
 * never existed) both fall into `'redirect-home'`, never a rendered-but-empty results
 * screen. A session that DOES exist but has `totalCount === 0` shouldn't be reachable in
 * practice (`SessionRunner.tsx#finalizeSession` deletes exactly that case before this page
 * ever mounts), but is treated the same defensively rather than trusted blindly.
 */
import { useEffect, useState } from 'react'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { getSession } from '@/db/repositories/sessions.repository.ts'
import type { SessionRecord } from '@/types/progress.ts'
import { buildSessionSummary, type SessionSummaryView } from '../lib/build-session-summary.ts'

export type SessionResultStatus =
  | { readonly phase: 'loading' }
  | { readonly phase: 'redirect-home' }
  | { readonly phase: 'error'; readonly message: string }
  | {
      readonly phase: 'ready'
      readonly session: SessionRecord
      readonly summary: SessionSummaryView
    }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useSessionResult(sessionId: number | undefined): SessionResultStatus {
  const [status, setStatus] = useState<SessionResultStatus>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (sessionId === undefined) {
        if (!cancelled) setStatus({ phase: 'redirect-home' })
        return
      }
      try {
        const [session, logs] = await Promise.all([
          getSession(sessionId),
          getLogsForSession(sessionId),
        ])
        if (cancelled) return
        if (!session || session.totalCount === 0) {
          setStatus({ phase: 'redirect-home' })
          return
        }
        const summary = buildSessionSummary(session, logs)
        setStatus({ phase: 'ready', session, summary })
      } catch (error: unknown) {
        if (!cancelled) setStatus({ phase: 'error', message: errorMessage(error) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return status
}
