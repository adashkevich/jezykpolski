/**
 * `useLevelGate` (`spec/tasks/35-level-gated-new-words.md` §4) — live view of which content
 * levels the daily Learn session's new-word gate currently has open, for the home screen's
 * "Сейчас изучаем: A1 · осталось N слов" line and the `/stats` screen's "По уровням" block
 * (open levels shown as-is, closed ones muted "откроется позже").
 *
 * Both consumers need the exact same `unlockedLevels` computation `session-scope.ts
 * #resolveGlobalScope` already runs when it actually builds a queue — this hook is that same
 * pure computation (`words-progress.repository.ts#computeLevelPoolCounts` +
 * `learning/session/level-gate.ts#unlockedLevels`), just re-run here as a live query instead
 * of a one-off `Promise.all`, so it re-renders when `wordProgress` changes (a session
 * completes) or the "Начинать с уровня" setting changes — no new Dexie query shape, no new
 * stats bucket: `computeLevelPoolCounts` already reads through `getAllWordProgress()` (the
 * same full `wordProgress` read `useWordProgressSummary`'s screens already trigger) and the
 * in-memory content index.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import type { LevelValue } from '@/content/codec.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import {
  computeLevelPoolCounts,
  getAllWordProgress,
} from '@/db/repositories/words-progress.repository.ts'
import {
  NEW_WORDS_START_LEVEL_DEFAULT,
  NEW_WORDS_START_LEVEL_SETTING_KEY,
  unlockedLevels,
} from '@/learning/session/level-gate.ts'

export interface LevelGateState {
  /** Levels currently open for new words, in `LEVEL_VALUES` order — see `unlockedLevels`. */
  readonly unlocked: readonly LevelValue[]
  /** Still-unstarted word count per level — the home screen shows this for the lowest open
   *  level ("осталось N слов"). */
  readonly unstartedByLevel: Readonly<Record<LevelValue, number>>
}

/** `undefined` while the underlying live queries are still loading. */
export function useLevelGate(): LevelGateState | undefined {
  const startLevel = useLiveQuery(
    () => settingsRepo.get(NEW_WORDS_START_LEVEL_SETTING_KEY, NEW_WORDS_START_LEVEL_DEFAULT),
    [],
  )
  const counts = useLiveQuery(async () => computeLevelPoolCounts(await getAllWordProgress()), [])

  if (startLevel === undefined || counts === undefined) return undefined
  return { unlocked: unlockedLevels(counts, startLevel), unstartedByLevel: counts.unstartedByLevel }
}
