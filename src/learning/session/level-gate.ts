/**
 * The "level gate" for new words in the daily Learn session (`spec/tasks/35-level-gated-new-
 * words.md`, tightened to strict sequential progression by `spec/tasks/38-strict-level-
 * progression.md`; requirements FR-110/FR-133/FR-143/FR-144/FR-145/FR-146). Task 39
 * (`spec/tasks/39-practice-current-level.md`) reuses the same gate for `/practice`'s word
 * pool via {@link practicePoolLevel} — no separate gate for Practice.
 *
 * Without this module, `session-scope.ts#resolveGlobalScope` hands `buildLearnQueue` every
 * not-yet-started word in the whole corpus, sorted by raw frequency `rank` — but rank and
 * content level (`WordIndexEntry.level`, `LEVEL_VALUES` = A1..C2) only roughly correlate.
 * B2/C1 function words routinely sit in the first thousand ranks, so a rank-only sort puts
 * them in front of a brand-new learner in week one. This module decides two orthogonal
 * things instead: which levels are currently *open* for new words at all
 * ({@link unlockedLevels}), and in what order to hand out candidates once more than one is
 * open ({@link orderNewWordCandidates}) — `session-scope.ts` is the only caller that wires
 * both together (see that file's `resolveGlobalScope`).
 *
 * Task 38 (direct user decision, superseding task 35's own two "don't get stuck" allowances):
 * new words are drawn from exactly one level at a time — the lowest still-open level that
 * still has unstarted words — and the *next* level opens only once the current one has
 * **zero** unstarted words left. No early-open threshold, no ratchet: a level earns its
 * place by being fully started, not by one word answered from it by hand.
 *
 * Pure domain module: no React, no Dexie (`src/learning/**` — enforced by
 * `eslint.config.js`'s `no-restricted-imports`, same as every other file in this tree).
 */
import type { LevelValue } from '@/content/codec.ts'
import { LEVEL_VALUES } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'

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
}

/**
 * Уровни, из которых сейчас разрешено брать новые слова, в порядке `LEVEL_VALUES`.
 * Всегда непустой, пока в словаре вообще остались неначатые слова (см. правило 2 ниже —
 * `startLevel` само всегда открыто) — важно для `session-scope.ts`, который передаёт
 * результат в `WordQuery.levels`: пустой массив там читается как «фильтра нет вообще»
 * (`content/query.ts`), а не как «ничего не подходит».
 *
 * Правила (task 38, заменяют прежние послабления task 35):
 *  1. Уровни ниже `startLevel` закрыты всегда — просто никогда не входят в цикл ниже.
 *  2. `startLevel` открыт всегда.
 *  3. Уровень `L+1` открыт, если открыт `L` **и** `unstartedByLevel[L] === 0` — уровень
 *     пройден полностью, ни одного `new`-слова не осталось. Ни порога «почти пройден», ни
 *     храповика по начатым словам следующего уровня: слово, начатое вручную («Учить» с
 *     карточки слова, свайп) на уровне выше текущего, само по себе следующий уровень не
 *     открывает — открывает только полное исчерпание предыдущего.
 *  4. Открытие каскадное — раз `L` открыт по правилу 3, проверка для `L+1` использует то же
 *     условие, так что цепочка открытий распространяется в `LEVEL_VALUES`-порядке за один
 *     проход (актуально сразу после импорта бэкапа с прогрессом на нескольких уровнях, или
 *     если весь словарь уже пройден). Открытые уровни всегда образуют непрерывный префикс
 *     `LEVEL_VALUES`, начиная с `startLevel`.
 */
export function unlockedLevels(counts: LevelPoolCounts, startLevel: LevelValue): LevelValue[] {
  const startIndex = LEVEL_VALUES.indexOf(startLevel)
  const unlocked: LevelValue[] = [startLevel]

  for (let i = startIndex + 1; i < LEVEL_VALUES.length; i++) {
    const level = LEVEL_VALUES[i]!
    const previousLevel = LEVEL_VALUES[i - 1]!

    const previousFullyStarted = (counts.unstartedByLevel[previousLevel] ?? 0) === 0
    if (!previousFullyStarted) break
    unlocked.push(level)
  }

  return unlocked
}

/**
 * Младший из открытых уровней, в котором ещё есть неначатые слова — тот единственный
 * уровень, из которого сессия сейчас реально берёт новые слова. `undefined`, если во всём
 * открытом диапазоне (обычно это ровно один уровень — самый старший из открытых, см.
 * `unlockedLevels`) новых слов больше нет: либо весь словарь пройден, либо пользователь ждёт
 * ручного повышения `startLevel`.
 *
 * Единая точка правды для UI (`useLevelGate.ts`): и главный экран, и `/stats` должны
 * говорить про «сейчас изучаем» одно и то же, не выводя это заново каждый из своих
 * `unstartedByLevel`.
 */
export function currentNewWordLevel(
  counts: LevelPoolCounts,
  startLevel: LevelValue,
): LevelValue | undefined {
  return unlockedLevels(counts, startLevel).find(
    (level) => (counts.unstartedByLevel[level] ?? 0) > 0,
  )
}

/**
 * Уровень, до которого включительно берёт слова экран `/practice` (задача 39,
 * `spec/tasks/39-practice-current-level.md`): `currentNewWordLevel`, если во всём открытом
 * диапазоне ещё есть неначатые слова, иначе — самый старший открытый уровень (весь диапазон
 * пройден, дальше ждём ручного повышения `startLevel`).
 *
 * В отличие от `currentNewWordLevel` всегда определён — у `unlockedLevels` есть строгая
 * гарантия «`startLevel` открыт всегда» (правило 2 её же док-комментария), так что последний
 * элемент существует независимо от того, есть ли ещё неначатые слова.
 */
export function practicePoolLevel(counts: LevelPoolCounts, startLevel: LevelValue): LevelValue {
  const current = currentNewWordLevel(counts, startLevel)
  if (current) return current
  const unlocked = unlockedLevels(counts, startLevel)
  return unlocked[unlocked.length - 1]!
}

/**
 * Порядок кандидатов внутри сессии: по возрастанию `rank`, затем по позиции уровня в
 * `LEVEL_VALUES`.
 *
 * Под task 38's правилом неначатые слова есть только у ОДНОГО открытого уровня —
 * `currentNewWordLevel` — так что candidates за пределами этого единственного уровня в
 * `unlocked` на практике не бывает вовсе (`unstartedByLevel[L] === 0` для всех уже открытых
 * `L`, кроме последнего, — иначе следующий уровень не открылся бы). Сортировка по
 * `(индекс уровня, rank)` — не полагается на этот инвариант, а гарантирует его структурно:
 * даже если он на минуту нарушится (импорт бэкапа, сброс части слов), порядок всё равно
 * останется «сначала младший уровень целиком».
 *
 * Pure and deterministic: no `Math.random()`, no clock read — same property
 * `buildLearnQueue` already holds and must not lose once this feeds it.
 */
export function orderNewWordCandidates(
  candidates: readonly WordIndexEntry[],
  unlocked: readonly LevelValue[],
): WordIndexEntry[] {
  const levelIndex = new Map(unlocked.map((level, i) => [level, i]))

  return candidates
    .filter((candidate) => levelIndex.has(candidate.level))
    .slice()
    .sort((a, b) => {
      const levelDelta = levelIndex.get(a.level)! - levelIndex.get(b.level)!
      return levelDelta !== 0 ? levelDelta : a.rank - b.rank
    })
}
