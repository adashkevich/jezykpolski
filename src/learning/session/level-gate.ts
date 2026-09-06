/**
 * The "level gate" for new words in the daily Learn session (`spec/tasks/35-level-gated-new-
 * words.md`, requirements FR-110/FR-133/FR-143/FR-144/FR-145/FR-146).
 *
 * Without this module, `session-scope.ts#resolveGlobalScope` hands `buildLearnQueue` every
 * not-yet-started word in the whole corpus, sorted by raw frequency `rank` — but rank and
 * content level (`WordIndexEntry.level`, `LEVEL_VALUES` = A1..C2) only roughly correlate.
 * B2/C1 function words routinely sit in the first thousand ranks, so a rank-only sort puts
 * them in front of a brand-new learner in week one. This module decides two orthogonal
 * things instead: which levels are currently *open* for new words at all
 * ({@link unlockedLevels}), and how to interleave candidates once more than one level is open
 * ({@link orderNewWordCandidates}) — `session-scope.ts` is the only caller that wires both
 * together (see that file's `resolveGlobalScope`).
 *
 * Pure domain module: no React, no Dexie (`src/learning/**` — enforced by
 * `eslint.config.js`'s `no-restricted-imports`, same as every other file in this tree).
 */
import type { LevelValue } from '@/content/codec.ts'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'

/** Сколько невыученных слов уровня должно остаться, чтобы открылся следующий.
 *  Порог, а не ноль: последние слова уровня — самые редкие и самые «залипающие»
 *  (пользователь мог отложить их свайпом), ждать их полного исчерпания значило бы
 *  застревать на A1 месяцами. */
export const LEVEL_UNLOCK_REMAINING = 50

/** `settings` table key (`db/repositories/settings.repository.ts`) for the level the daily
 *  session's new-word gate starts from (task text §3) — same house convention as
 *  `hint-mode.ts`'s `NOUN_HINT_MODE_SETTING_KEY`: a bare `*_SETTING_KEY`/`*_DEFAULT` pair,
 *  read directly via `settingsRepo.get(KEY, DEFAULT)` at the call site, never a Dexie-aware
 *  getter/setter wrapper here (that would pull Dexie into this pure `learning/**` module). */
export const NEW_WORDS_START_LEVEL_SETTING_KEY = 'newWordsStartLevel'

/** Default: everyone starts at the bottom, A1. */
export const NEW_WORDS_START_LEVEL_DEFAULT: LevelValue = 'A1'

export interface LevelPoolCounts {
  /** Сколько слов уровня ещё имеет статус `new` (ни одного навыка не заведено). */
  readonly unstartedByLevel: Readonly<Record<LevelValue, number>>
  /** Есть ли на уровне хотя бы одно начатое слово. */
  readonly startedByLevel: Readonly<Record<LevelValue, boolean>>
}

/**
 * Уровни, из которых сейчас разрешено брать новые слова, в порядке `LEVEL_VALUES`.
 * Всегда непустой, пока в словаре вообще остались неначатые слова (см. правило 2 ниже —
 * `startLevel` само всегда открыто).
 *
 * Правила (task text §1):
 *  1. Уровни ниже `startLevel` закрыты всегда — просто никогда не входят в цикл ниже.
 *  2. `startLevel` открыт всегда.
 *  3. Уровень `L+1` открыт, если открыт `L` и выполнено хотя бы одно из:
 *     - `unstartedByLevel[L] <= LEVEL_UNLOCK_REMAINING` (уровень подходит к концу);
 *     - `startedByLevel[L+1] === true` (уровень-храповик — уже начатые слова на `L+1` не
 *       дают ему снова закрыться, даже если `unstartedByLevel[L]` потом подрастёт — импорт
 *       бэкапа, сброс прогресса части слов).
 *  4. Открытие каскадное — раз `L` открыт по любой из причин выше, проверка для `L+1`
 *     использует ровно те же два условия, так что цепочка открытий распространяется в
 *     `LEVEL_VALUES`-порядке за один проход. Открытые уровни всегда образуют непрерывный
 *     префикс `LEVEL_VALUES`, начиная с `startLevel` — не может случиться так, что `L+1`
 *     закрыт, а `L+2` открыт.
 */
export function unlockedLevels(counts: LevelPoolCounts, startLevel: LevelValue): LevelValue[] {
  const startIndex = LEVEL_VALUES.indexOf(startLevel)
  const unlocked: LevelValue[] = [startLevel]

  for (let i = startIndex + 1; i < LEVEL_VALUES.length; i++) {
    const level = LEVEL_VALUES[i]!
    const previousLevel = LEVEL_VALUES[i - 1]!

    const previousAlmostDone =
      (counts.unstartedByLevel[previousLevel] ?? 0) <= LEVEL_UNLOCK_REMAINING
    const alreadyStarted = counts.startedByLevel[level] === true

    if (!previousAlmostDone && !alreadyStarted) break
    unlocked.push(level)
  }

  return unlocked
}

/**
 * Порядок кандидатов внутри сессии: смешивает два младших непустых открытых уровня в
 * пропорции 2:1, внутри уровня — по возрастанию `rank`.
 *
 * `L0` — младший открытый уровень, в котором ещё есть кандидаты; `L1` — следующий за ним
 * такой же. Слоты раздаются по циклу `L0, L0, L1` (две трети младшему уровню, треть
 * следующему); когда `L1` пуст, всё уходит `L0`. Any *further* unlocked level (a third,
 * ratchet-opened level whose own new words haven't reached the front of the mix yet — rare
 * in practice, since a level only opens once its predecessor is nearly drained or already
 * started) simply follows the L0/L1 mix, each internally sorted by rank — still
 * deterministic, just outside the explicit 2:1 interleave, so no candidate the caller passed
 * in ever silently vanishes.
 *
 * Pure and deterministic: no `Math.random()`, no clock read — same property
 * `buildLearnQueue` already holds and must not lose once this feeds it.
 */
export function orderNewWordCandidates(
  candidates: readonly WordIndexEntry[],
  unlocked: readonly LevelValue[],
): WordIndexEntry[] {
  const unlockedSet = new Set(unlocked)
  const byLevel = new Map<LevelValue, WordIndexEntry[]>()

  for (const candidate of candidates) {
    if (!unlockedSet.has(candidate.level)) continue
    const bucket = byLevel.get(candidate.level)
    if (bucket) bucket.push(candidate)
    else byLevel.set(candidate.level, [candidate])
  }
  for (const bucket of byLevel.values()) {
    bucket.sort((a, b) => a.rank - b.rank)
  }

  // Levels with at least one candidate, in `unlocked`'s own (== LEVEL_VALUES) order.
  const nonEmptyLevels = unlocked.filter((level) => byLevel.has(level))
  if (nonEmptyLevels.length === 0) return []

  const l0 = nonEmptyLevels[0]!
  const l1 = nonEmptyLevels[1]
  const queueL0 = [...byLevel.get(l0)!]
  const queueL1 = l1 ? [...byLevel.get(l1)!] : []

  const mixed: WordIndexEntry[] = []
  let step = 0
  while (queueL0.length > 0 || queueL1.length > 0) {
    const wantL1 = step % 3 === 2
    if (wantL1 && queueL1.length > 0) {
      mixed.push(queueL1.shift()!)
    } else if (queueL0.length > 0) {
      mixed.push(queueL0.shift()!)
    } else {
      mixed.push(queueL1.shift()!)
    }
    step++
  }

  const rest: WordIndexEntry[] = []
  for (let i = 2; i < nonEmptyLevels.length; i++) {
    rest.push(...byLevel.get(nonEmptyLevels[i]!)!)
  }

  return [...mixed, ...rest]
}
