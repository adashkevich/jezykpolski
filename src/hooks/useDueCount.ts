/**
 * `useDueCount` (`spec/tasks/05-persistence.md` §8) — live count of skills due for review,
 * for badges/counters (e.g. bottom-nav "Practice" badge, home screen).
 *
 * Built on `useLiveQuery` so components never write a Dexie query themselves (NFR-12, this
 * task's acceptance point 7) — they call this hook and get a live-updating number.
 */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { countDue } from '@/db/repositories/skills.repository.ts'
import type { SkillKind } from '@/types/progress.ts'

/**
 * Re-runs whenever `skills` changes (any write inside a `readwrite` transaction that
 * touches it — chiefly `applyAnswer` and `ensureSkill`) or `kind`/`now` change.
 *
 * `now` defaults to "the instant this hook instance first mounted", captured once via
 * `useState`'s lazy initializer rather than read fresh on every render — reading `Date.now()`
 * directly in a render body is impure (`react-hooks/purity`: it can disagree with itself
 * across React's double-invoked/concurrent renders) and a due-count badge that's a few
 * minutes stale is fine anyway. Pass an explicit `now` (e.g. from a ticking clock elsewhere
 * in the tree) if a caller ever needs the count to also advance in real time as `due`
 * timestamps are crossed.
 */
export function useDueCount(kind?: SkillKind, now?: number): number | undefined {
  const [mountedAt] = useState(() => Date.now())
  const effectiveNow = now ?? mountedAt
  return useLiveQuery(() => countDue(effectiveNow, kind), [kind, effectiveNow])
}
