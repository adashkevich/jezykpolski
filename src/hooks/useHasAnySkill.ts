/**
 * Live "has the user materialized at least one skill yet" flag
 * (`spec/tasks/25-offline-update.md` §6) — see `db/repositories/skills.repository.ts#hasAnySkill`
 * for why this is the chosen "actually started learning" signal.
 *
 * Same `useLiveQuery` pattern as `useDueCount` (NFR-12: components never query Dexie
 * directly).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { hasAnySkill } from '@/db/repositories/skills.repository.ts'

export function useHasAnySkill(): boolean | undefined {
  return useLiveQuery(() => hasAnySkill(), [])
}
