/**
 * Usage-ranking for the collapsible blocks on `TrainingSetupScreen`
 * (`spec/tasks/33-training-block-usage-ranking.md` §1, requirements FR-113/FR-141/FR-142).
 *
 * Pure domain module: no React, no Dexie (architecture.md §3, enforced by
 * `eslint.config.js`'s `src/learning/**` `no-restricted-imports` block). Persistence
 * (`features/training-setup/hooks/useTrainingBlockOrder.ts`, `db/repositories/
 * settings.repository.ts`) and the screen that consumes `orderBlocks` both live outside this
 * file.
 *
 * The task text's own requirement, quoted literally: "сто раз месяц назад, десять раз сейчас
 * должно дать преимущество новому блоку" — a hundred runs a month ago must lose to ten runs
 * today. A plain counter can never do this (old runs never depreciate), so usage is tracked as
 * an exponentially-decayed score instead of a raw count.
 *
 * Storing the already-decayed `score` (reduced to `updatedAt`) rather than a full run log is a
 * deliberate size/precision trade: a `BlockUsageMap` is a handful of numbers regardless of how
 * long the app has been used (no unbounded history, no schema migration), and no precision is
 * lost doing this — exponential decay is associative, so "decay-then-add-one" on every run
 * produces exactly the same score as summing the decayed weight of every run individually.
 */

/** Half-life of a run's weight. 7 days is chosen against the task's own worked example: a
 *  score of 100 accumulated 30 days ago decays to 100 * 0.5^(30/7) ≈ 5.1 — below the 10 a
 *  block gets from being run just 10 times today (`decayedScore` of a fresh run is `score +
 *  1` at `updatedAt`, i.e. undecayed). */
export const USAGE_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

export interface BlockUsage {
  /** Accumulated weight, already reduced to `updatedAt` (i.e. `decayedScore(usage,
   *  updatedAt) === score`). */
  readonly score: number
  readonly updatedAt: number
  /** Raw run count — never consulted for ordering, kept only for debugging/a meaningful
   *  export-import round trip (task text §1). */
  readonly runs: number
}

export type BlockUsageMap = Readonly<Record<string, BlockUsage>>

/** `settings` table key (`db/repositories/settings.repository.ts`) the map is persisted
 *  under (`spec/tasks/33-training-block-usage-ranking.md` §2) — same house convention as
 *  `learning/exercises/hint-mode.ts`'s `NOUN_HINT_MODE_SETTING_KEY`: a bare exported
 *  `*_SETTING_KEY` + `*_DEFAULT` pair, read directly via `settingsRepo.get(KEY, DEFAULT)` at
 *  the call site (`features/training-setup/hooks/useTrainingBlockOrder.ts`) rather than a
 *  getter/setter wrapper here, which would pull Dexie into this pure `learning/**` module. */
export const BLOCK_USAGE_SETTING_KEY = 'practiceBlockUsage'

/** Empty map — every block starts at a decayed score of 0, so `orderBlocks` falls back to
 *  `defaultOrder` until the user actually runs something. */
export const BLOCK_USAGE_DEFAULT: BlockUsageMap = {}

/** `usage`'s `score` decayed forward from `usage.updatedAt` to `at`. `undefined` (a block
 *  never run) decays to 0 regardless of `at`. */
export function decayedScore(usage: BlockUsage | undefined, at: number): number {
  if (!usage) return 0
  const elapsedMs = at - usage.updatedAt
  return usage.score * Math.pow(0.5, elapsedMs / USAGE_HALF_LIFE_MS)
}

/** `map` with one more run of block `id` folded in at time `at`: the previous score is decayed
 *  to `at` and incremented by 1, `runs` is incremented, `updatedAt` becomes `at`. Every other
 *  entry in `map` is returned unchanged. */
export function recordBlockRun(map: BlockUsageMap, id: string, at: number): BlockUsageMap {
  const prev = map[id]
  return {
    ...map,
    [id]: {
      score: decayedScore(prev, at) + 1,
      updatedAt: at,
      runs: (prev?.runs ?? 0) + 1,
    },
  }
}

/** `defaultOrder` sorted by descending `decayedScore(map[id], at)`. Ties — including every
 *  block still at a score of 0 on a fresh install — keep `defaultOrder`'s relative order (a
 *  stable sort), so an unused app renders exactly the order task 32 established. `id`s present
 *  in `map` but absent from `defaultOrder` (a block a newer app version removed) are silently
 *  ignored rather than injected into the result. */
export function orderBlocks(
  defaultOrder: readonly string[],
  map: BlockUsageMap,
  at: number,
): string[] {
  return defaultOrder
    .map((id, index) => ({ id, index, score: decayedScore(map[id], at) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.id)
}
