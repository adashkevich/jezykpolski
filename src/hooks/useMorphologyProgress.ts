/**
 * `useMorphologyProgress` (`spec/tasks/23-stats.md`) — live "Падежи"/"Времена глаголов" data
 * for the `/stats` screen (FR-124/FR-125).
 *
 * Thin `useLiveQuery` wrapper around `stats.repository.ts#getMorphologyProgress`. `dexie-
 * react-hooks` only tracks the Dexie tables that function actually reads (`skills`, via the
 * `kind` index) — the content-derived denominators it also awaits are a plain cached
 * `Promise`, not a Dexie query, so they never trigger a spurious re-run on their own; this
 * hook still re-runs on every `skills` write (`applyAnswer`/`ensureSkill`), same as
 * `useDueCount.ts`.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getMorphologyProgress,
  type MorphologyProgress,
} from '@/db/repositories/stats.repository.ts'

export function useMorphologyProgress(): MorphologyProgress | undefined {
  return useLiveQuery(() => getMorphologyProgress(), [])
}
