/**
 * `useConfusionMatrix` (`spec/tasks/27-context-and-error-analysis.md` §1, FR-104/FR-105) —
 * live confusion-pair data for the `/stats` screen's "Ты часто путаешь..." card.
 *
 * Thin `useLiveQuery` wrapper around `db/repositories/confusion.repository.ts#getConfusionMatrix`,
 * same shape as `useMorphologyProgress.ts` — `dexie-react-hooks` tracks the one Dexie table
 * that function actually reads (`reviewLogs`), so this re-runs after every session that logs
 * a wrong answer, without any manual refetch wiring.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getConfusionMatrix, type ConfusionPair } from '@/db/repositories/confusion.repository.ts'

export function useConfusionMatrix(): ConfusionPair[] | undefined {
  return useLiveQuery(() => getConfusionMatrix(), [])
}
