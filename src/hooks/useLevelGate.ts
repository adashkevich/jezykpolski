/**
 * `useLevelGate` (`spec/tasks/35-level-gated-new-words.md` §4, tightened to strict sequential
 * progression by `spec/tasks/38-strict-level-progression.md`) — live view of which content
 * levels the daily Learn session's new-word gate currently has open, for the home screen's
 * "Сейчас изучаем: A1 · осталось N слов" line, the `/stats` screen's "По уровням" block (open
 * levels shown as-is, closed ones muted "откроется позже"), and — since task 39
 * (`spec/tasks/39-practice-current-level.md`) — `/practice`'s own word pool via
 * `practiceLevel`.
 *
 * All four consumers need the exact same `unlockedLevels`/`currentNewWordLevel` computation
 * `session-scope.ts#resolveGlobalScope` already runs when it actually builds a queue — this
 * hook is that same pure computation (`words-progress.repository.ts#computeLevelPoolCounts` +
 * `learning/session/level-gate.ts`), just re-run here as a live query instead of a one-off
 * `Promise.all`, so it re-renders when `wordProgress` changes (a session completes) or the
 * "Начинать с уровня" setting changes — no new Dexie query shape, no new stats bucket:
 * `computeLevelPoolCounts` already reads through `getAllWordProgress()` (the same full
 * `wordProgress` read `useWordProgressSummary`'s screens already trigger) and the in-memory
 * content index.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import type { LevelValue } from '@/content/codec.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import {
  computeLevelPoolCounts,
  getAllWordProgress,
} from '@/db/repositories/words-progress.repository.ts'
import {
  currentNewWordLevel,
  NEW_WORDS_START_LEVEL_DEFAULT,
  NEW_WORDS_START_LEVEL_SETTING_KEY,
  practicePoolLevel,
  unlockedLevels,
} from '@/learning/session/level-gate.ts'

export interface LevelGateState {
  /** Levels currently open for new words, in `LEVEL_VALUES` order — see `unlockedLevels`.
   *  Under task 38's strict progression this is "every fully-started level up to and
   *  including `currentLevel`" — `/stats` uses it as-is to mark which rows are open. */
  readonly unlocked: readonly LevelValue[]
  /** The single level new words are currently drawn from — `learning/session/
   *  level-gate.ts#currentNewWordLevel`. `undefined` when the whole open range has no
   *  unstarted words left (the home screen hides its level-gate line in that case). */
  readonly currentLevel: LevelValue | undefined
  /** Still-unstarted word count per level — the home screen shows this for `currentLevel`
   *  ("осталось N слов"). */
  readonly unstartedByLevel: Readonly<Record<LevelValue, number>>
  /** The level `/practice`'s word pool is drawn up to and including (task 39,
   *  `learning/session/level-gate.ts#practicePoolLevel`) — same gate as the daily session,
   *  but always defined (falls back to the highest unlocked level once new words run out). */
  readonly practiceLevel: LevelValue
}

/** `undefined` while the underlying live queries are still loading. */
export function useLevelGate(): LevelGateState | undefined {
  const startLevel = useLiveQuery(
    () => settingsRepo.get(NEW_WORDS_START_LEVEL_SETTING_KEY, NEW_WORDS_START_LEVEL_DEFAULT),
    [],
  )
  const counts = useLiveQuery(async () => computeLevelPoolCounts(await getAllWordProgress()), [])

  if (startLevel === undefined || counts === undefined) return undefined
  return {
    unlocked: unlockedLevels(counts, startLevel),
    currentLevel: currentNewWordLevel(counts, startLevel),
    unstartedByLevel: counts.unstartedByLevel,
    practiceLevel: practicePoolLevel(counts, startLevel),
  }
}
