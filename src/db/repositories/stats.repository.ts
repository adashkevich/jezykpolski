/**
 * `/stats` screen aggregation (`spec/tasks/23-stats.md`, `spec/app-design.md` §26,
 * requirements.md FR-120…FR-126).
 *
 * Every function here follows the same numerator/denominator split as
 * `words-progress.repository.ts` (architecture.md §5.2 "знаменатель из контента, числитель
 * из БД"):
 *  - "known/learning", "due today/tomorrow/7 days" — numerators come from indexed Dexie
 *    queries (`status`/`due`/`[kind+due]`), never a full-table `.toArray()`.
 *  - "по уровням"/"части речи" percentages — the numerator is `words-progress.repository.ts
 *    #getWordProgressSummary`'s already-computed `learnedByLevel`/`learnedByPos` (one
 *    `status`-index scan, shared with the home screen so the two screens can never disagree
 *    "by construction" — task text, decision-log requirement); the denominator is the
 *    content index's `byLevel`/`byPos` bucket sizes (`content/index-store.ts`, an in-memory
 *    `Map` built once at startup — not a second Dexie query).
 *  - "падежи"/"времена глаголов" — see `getMorphologyProgress`'s own header below, the
 *    task's stated "main risk".
 */
import { db } from '../database.ts'
import { countDue, countDueBetween } from './skills.repository.ts'
import type { WordProgressSummary } from './words-progress.repository.ts'
import type { CaseValue, LevelValue, PosValue, TenseValue } from '@/content/codec.ts'
import { LEVEL_VALUES, POS_VALUES } from '@/content/codec.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { getParadigm } from '@/content/paradigms.ts'
import { endOfTomorrow, in7Days, startOfTomorrow } from '@/lib/dates.ts'
import { skillMaturity } from '@/learning/progress/aggregate.ts'
import { enumerateSkills } from '@/learning/skills/enumerate.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'

// ---------------------------------------------------------------------------
// Повторения — сегодня / завтра / 7 дней (FR-123).
//
// Deliberately reuses `skills.repository.ts#countDue`/`countDueBetween` — the exact same
// functions `useDueCount.ts` calls for the home screen's "Повторить N" counter — rather
// than a fresh query, so the two screens' numbers agree *by construction*, not by
// coincidence (spec/tasks/23-stats.md's acceptance point 3, and this task's own brief).
// Both are already index-only ([kind+due] omitted here since the stats screen counts every
// kind combined, so the plain `due` index — never a full scan).
//
// Day boundaries come from `lib/dates.ts` (task 11), which is LOCAL-timezone by
// construction (acceptance point 4) — see that module's own header for why.
// ---------------------------------------------------------------------------

export interface ReviewCounts {
  today: number
  tomorrow: number
  in7Days: number
}

export async function getReviewCounts(now: number): Promise<ReviewCounts> {
  const [today, tomorrowCount, weekCount] = await Promise.all([
    countDue(now),
    countDueBetween(startOfTomorrow(now), endOfTomorrow(now)),
    countDueBetween(now, in7Days(now)),
  ])
  return { today, tomorrow: tomorrowCount, in7Days: weekCount }
}

// ---------------------------------------------------------------------------
// По уровням / части речи (FR-121/FR-122).
// ---------------------------------------------------------------------------

export interface BucketProgress<K extends string> {
  key: K
  known: number
  total: number
  /** 0..1; `0` when `total` is `0` (no such word exists in the corpus — never happens for
   *  a real level/POS, but defensive rather than `NaN`). */
  percent: number
}

function bucketProgress<K extends string>(
  keys: readonly K[],
  known: Partial<Record<K, number>>,
  totalOf: (key: K) => number,
): BucketProgress<K>[] {
  return keys.map((key) => {
    const knownCount = known[key] ?? 0
    const total = totalOf(key)
    return { key, known: knownCount, total, percent: total > 0 ? knownCount / total : 0 }
  })
}

/** "По уровням" — one row per `LEVEL_VALUES` entry (A1..C2), in that order (acceptance
 *  point 1: numerator matches `/words`'s own level+status filter exactly, since both read
 *  the same `known ∪ mastered` id set; acceptance point 2: denominator is
 *  `getIndexStore().byLevel`'s per-level bucket size, content — not a `wordProgress` count). */
export function levelProgress(summary: WordProgressSummary): BucketProgress<LevelValue>[] {
  const totals = new Map<LevelValue, number>()
  for (const level of LEVEL_VALUES) totals.set(level, 0)
  for (const entry of getIndexStore().byLevel) totals.set(entry.level, (totals.get(entry.level) ?? 0) + 1)
  return bucketProgress(LEVEL_VALUES, summary.learnedByLevel, (level) => totals.get(level) ?? 0)
}

/** "Части речи" — one row per `POS_VALUES` entry (NOUN/VERB/ADJ/ADV). Denominator is
 *  `getIndexStore().byPos`'s bucket size directly (already grouped, task 04) — no extra
 *  pass needed, unlike `levelProgress` (`byLevel` is a flat rank-ordered array, not grouped). */
export function posProgress(summary: WordProgressSummary): BucketProgress<PosValue>[] {
  return bucketProgress(
    POS_VALUES,
    summary.learnedByPos,
    (pos) => getIndexStore().byPos.get(pos)?.length ?? 0,
  )
}

// ---------------------------------------------------------------------------
// Падежи / времена глаголов (FR-124/FR-125) — the task's stated main performance risk.
//
// Numerator: sum of `skillMaturity` over every *materialized* `noun`/`verb` `SkillRecord`
// grouped by case/tense, read via `db.skills.where('kind').equals('noun'|'verb')` — an
// INDEX query (`kind` is its own index on `skills`, `database.ts`), not a scan of the whole
// `skills` table (which also holds `vocab`/`adj`/`adv` rows). This can legitimately return
// many rows (every noun/verb skill the user has ever touched), but that is exactly the
// "materialized subset", never the ~195k theoretically possible skills across the whole
// corpus — the task text's own example of what the naive/wrong implementation would do
// instead.
//
// Denominator: NOT the count of materialized skills (that would make every case's percent
// trivially ~100%, since a skill is only materialized once first practiced), but the true
// number of that case's/tense's slots across the WHOLE corpus — content, not DB
// (architecture.md §5.2). Computing this exactly requires walking every NOUN (for case) or
// VERB (for tense) word's full paradigm via `enumerateSkills` (the same denominator function
// every per-word percentage in this app already uses), which needs each word's `Paradigm`
// fetched over the network the first time (`content/paradigms.ts#getParadigm`, task 04's
// already-deduplicated per-shard cache). That one-time cost is unavoidable for an exact
// answer and is NOT part of the "<300ms at 20k skills" budget (that budget is specifically
// about `skills`-table query performance at DB scale, spec/tasks/23-stats.md §2 — the corpus
// itself is fixed-size and content-hashed, not something that grows with the user's review
// history).
//
// Case and tense denominators are cached (and therefore fetched) SEPARATELY —
// `caseDenominatorsPromise`/`tenseDenominatorsPromise` below — rather than one combined
// promise, specifically so a learner who has only started NOUN practice never triggers a
// fetch of every VERB paradigm (and vice versa): `getMorphologyProgress` only asks for the
// denominator a block actually needs, gated on that block's own `hasNounData`/`hasVerbData`.
// Each promise is still resolved at most ONCE per browser tab (task text's own explicitly
// sanctioned option, §2: "агрегация через enumerateSkills по всем словам один раз с
// кэшированием результата в памяти на время жизни модуля/экрана"), so every subsequent
// `/stats` visit (and every live-query re-run triggered by a new answer) reuses it instantly
// with zero network cost.
// ---------------------------------------------------------------------------

/** `"noun:sg:genitive"` -> `"genitive"`; anything else -> `undefined`. */
function caseOfDimension(dimension: string): CaseValue | undefined {
  const parts = dimension.split(':')
  return parts[0] === 'noun' ? (parts[2] as CaseValue) : undefined
}

/** `"verb:present:1:sg"` -> `"present"`, `"verb:past:1:sg:masculine"` -> `"past"`;
 *  `"verb:imperative:..."` (no tense) and anything non-verb -> `undefined`. */
function tenseOfDimension(dimension: string): TenseValue | undefined {
  const parts = dimension.split(':')
  if (parts[0] !== 'verb') return undefined
  const slot = parts[1]
  return slot === 'present' || slot === 'past' || slot === 'future' ? slot : undefined
}

async function computeCaseDenominators(): Promise<Map<CaseValue, number>> {
  const byCase = new Map<CaseValue, number>()
  const nounWords = getIndexStore().byPos.get('NOUN') ?? []
  const paradigms = await Promise.all(
    nounWords.map((word) => getParadigm(encodeWordId(word.lemma, word.pos))),
  )
  nounWords.forEach((word, i) => {
    const paradigm = paradigms[i]
    if (!paradigm) return // 14 words with no paradigm at all (task 02 §6) — no slots
    for (const descriptor of enumerateSkills(word, paradigm)) {
      const caseValue = caseOfDimension(descriptor.dimension)
      if (caseValue) byCase.set(caseValue, (byCase.get(caseValue) ?? 0) + 1)
    }
  })
  return byCase
}

async function computeTenseDenominators(): Promise<Map<TenseValue, number>> {
  const byTense = new Map<TenseValue, number>()
  const verbWords = getIndexStore().byPos.get('VERB') ?? []
  const paradigms = await Promise.all(
    verbWords.map((word) => getParadigm(encodeWordId(word.lemma, word.pos))),
  )
  verbWords.forEach((word, i) => {
    const paradigm = paradigms[i]
    if (!paradigm) return
    for (const descriptor of enumerateSkills(word, paradigm)) {
      const tense = tenseOfDimension(descriptor.dimension)
      if (tense) byTense.set(tense, (byTense.get(tense) ?? 0) + 1)
    }
  })
  return byTense
}

let caseDenominatorsPromise: Promise<Map<CaseValue, number>> | null = null
let tenseDenominatorsPromise: Promise<Map<TenseValue, number>> | null = null

function getCaseDenominators(): Promise<Map<CaseValue, number>> {
  caseDenominatorsPromise ??= computeCaseDenominators()
  return caseDenominatorsPromise
}

function getTenseDenominators(): Promise<Map<TenseValue, number>> {
  tenseDenominatorsPromise ??= computeTenseDenominators()
  return tenseDenominatorsPromise
}

/** Test-only: clears the module-level denominator caches, mirroring
 *  `content/index-store.ts#__resetIndexStoreForTest` — otherwise one test's content index
 *  would leak its cached denominators into the next test that imports this module. */
export function __resetMorphologyDenominatorsForTest(): void {
  caseDenominatorsPromise = null
  tenseDenominatorsPromise = null
}

export interface MorphologyProgress {
  /** Whether at least one `noun`/`verb` `SkillRecord` has ever been materialized — gates
   *  the whole "Падежи"/"Времена глаголов" block (acceptance point 7: hidden, not a wall of
   *  zeros, until morphology practice has actually started). */
  hasNounData: boolean
  hasVerbData: boolean
  /** Present (possibly `0`) for all 7 `CaseValue`s once `hasNounData`; empty otherwise. */
  caseProgress: ReadonlyMap<CaseValue, number>
  /** Present (possibly `0`) for all 3 `TenseValue`s once `hasVerbData`; empty otherwise. */
  tenseProgress: ReadonlyMap<TenseValue, number>
}

export async function getMorphologyProgress(): Promise<MorphologyProgress> {
  // Indexed by `kind` (`database.ts`'s `skills` index string includes bare `kind`) — reads
  // only the materialized noun/verb rows, never the full `skills` table.
  const [nounSkills, verbSkills] = await Promise.all([
    db.skills.where('kind').equals('noun').toArray(),
    db.skills.where('kind').equals('verb').toArray(),
  ])

  const hasNounData = nounSkills.length > 0
  const hasVerbData = verbSkills.length > 0

  if (!hasNounData && !hasVerbData) {
    return { hasNounData, hasVerbData, caseProgress: new Map(), tenseProgress: new Map() }
  }

  // Each denominator is only fetched once its own block actually has data — a noun-only
  // learner never triggers a VERB paradigm fetch, and vice versa (see the section header
  // above) — and only ever once per tab session thereafter.
  const [caseDenominators, tenseDenominators] = await Promise.all([
    hasNounData ? getCaseDenominators() : Promise.resolve(new Map<CaseValue, number>()),
    hasVerbData ? getTenseDenominators() : Promise.resolve(new Map<TenseValue, number>()),
  ])

  const caseSums = new Map<CaseValue, number>()
  for (const skill of nounSkills) {
    const caseValue = caseOfDimension(skill.dimension)
    if (!caseValue) continue
    caseSums.set(caseValue, (caseSums.get(caseValue) ?? 0) + skillMaturity(skill))
  }
  const caseProgress = new Map<CaseValue, number>()
  for (const [caseValue, total] of caseDenominators) {
    caseProgress.set(caseValue, total > 0 ? (caseSums.get(caseValue) ?? 0) / total : 0)
  }

  const tenseSums = new Map<TenseValue, number>()
  for (const skill of verbSkills) {
    const tense = tenseOfDimension(skill.dimension)
    if (!tense) continue
    tenseSums.set(tense, (tenseSums.get(tense) ?? 0) + skillMaturity(skill))
  }
  const tenseProgress = new Map<TenseValue, number>()
  for (const [tense, total] of tenseDenominators) {
    tenseProgress.set(tense, total > 0 ? (tenseSums.get(tense) ?? 0) / total : 0)
  }

  return { hasNounData, hasVerbData, caseProgress, tenseProgress }
}
