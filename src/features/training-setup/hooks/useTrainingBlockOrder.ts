/**
 * Usage-based ordering for `TrainingSetupScreen`'s collapsible blocks
 * (`spec/tasks/33-training-block-usage-ranking.md` §3). Wraps the pure
 * `learning/practice/block-usage.ts` (`orderBlocks`/`recordBlockRun`) with the persistence
 * (`settings` table key `practiceBlockUsage`) and one-shot-on-mount timing the task text
 * requires — the pure module itself has no notion of "when" or "where stored".
 *
 * "Fixed for the life of the screen" (task text point 1/point 4): `order` is computed exactly
 * once, in the mount effect, from whatever `practiceBlockUsage` held *at that moment* — never
 * recomputed on a later render, and in particular never recomputed after `recordRun` updates
 * the underlying map. Re-deriving on every `recordRun` would reorder the list out from under
 * the user's finger the instant they tap "Начать" on a block that isn't already on top, which
 * is the exact jumpiness the task text calls out as unacceptable.
 *
 * "No skeleton, no jump" (task text point 2): before the read resolves, `order` is
 * `defaultOrder` itself (task 32's fixed order) rather than `null`/loading — the screen renders
 * immediately, and the one re-render once real usage data arrives is the *only* reorder that
 * ever happens for this mount.
 */
import { useEffect, useRef, useState } from 'react'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import {
  BLOCK_USAGE_DEFAULT,
  BLOCK_USAGE_SETTING_KEY,
  orderBlocks,
  recordBlockRun,
  type BlockUsageMap,
} from '@/learning/practice/block-usage.ts'

export interface UseTrainingBlockOrderResult {
  readonly order: readonly string[]
  /** Records a run of block `id` — fire-and-forget: the write happens in the background and
   *  never blocks starting the session (task text point 3). A failed read/write is logged and
   *  otherwise swallowed; it must never stop the block's own "Начать" from working. */
  readonly recordRun: (id: string) => void
}

export function useTrainingBlockOrder(defaultOrder: readonly string[]): UseTrainingBlockOrderResult {
  const [order, setOrder] = useState<readonly string[]>(defaultOrder)
  // Holds the current usage map so `recordRun` can update it without waiting for a re-render
  // (and without becoming a dependency that would re-trigger the mount effect below).
  const usageRef = useRef<BlockUsageMap | null>(null)

  useEffect(() => {
    let alive = true
    settingsRepo
      .get<BlockUsageMap>(BLOCK_USAGE_SETTING_KEY, BLOCK_USAGE_DEFAULT)
      .then((map) => {
        // Guard against the (practically unreachable, given a human click is far slower than
        // one IndexedDB read) race where `recordRun` already fired before this read resolved:
        // never let a stale read clobber a newer in-memory map.
        if (usageRef.current === null) usageRef.current = map
        if (!alive) return
        setOrder(orderBlocks(defaultOrder, map, Date.now()))
      })
      .catch((error: unknown) => {
        // Task text point/acceptance: a read failure must not stop the screen from opening —
        // `order` simply stays `defaultOrder` (this hook's own initial state).
        console.error('useTrainingBlockOrder: failed to read block usage', error)
      })
    return () => {
      alive = false
    }
    // Deliberately runs once per mount — task text point 1/point 4: the order is fixed for
    // the life of the screen, so `defaultOrder` (a stable array from the caller, never
    // reconstructed) is intentionally excluded from the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function recordRun(id: string) {
    const at = Date.now()
    const current = usageRef.current ?? BLOCK_USAGE_DEFAULT
    const next = recordBlockRun(current, id, at)
    usageRef.current = next
    settingsRepo.set(BLOCK_USAGE_SETTING_KEY, next).catch((error: unknown) => {
      console.error('useTrainingBlockOrder: failed to persist block usage', error)
    })
  }

  return { order, recordRun }
}
