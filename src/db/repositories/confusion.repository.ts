/**
 * The confusion matrix (`spec/tasks/27-context-and-error-analysis.md` §1, FR-104/FR-105).
 *
 * Built entirely from data already collected since the MVP — `reviewLogs.answerGiven` +
 * `skillId` (task 05, `spec/architecture.md` §8) — no schema migration, exactly as the task
 * text's acceptance criterion requires. Scope is deliberately narrow, per the supervisor's
 * own explicit decision: ONLY noun case dimensions (`noun:*:*`), aggregated across the pair
 * of cases and ignoring number (sg/pl) — verb/adj confusion pairs are out of scope for this
 * implementation.
 *
 * Algorithm (supervisor's own literal steps):
 *  1. Every `false`-`correct` `reviewLogs` row.
 *  2. Decode `skillId` -> `{wordId, dimension}`; skip anything whose dimension isn't
 *     `noun:*:*`.
 *  3. Fetch the word's `Paradigm` (`content/paradigms.ts#getParadigm`); skip if the word has
 *     none (14 real words, task 02 §6) or its index entry is missing. Run `enumerateSkills`
 *     to get the word's own dimension -> accepted-answers map (the exact "reverse lookup"
 *     `enumerate.ts`'s `answersByDimension` already builds internally).
 *  4. Normalize `answerGiven` the same way `grade.ts` compares Polish answers for an EXACT
 *     match (trim + collapse whitespace + lowercase) — diacritics are NOT stripped, so this
 *     only ever catches a genuine "wrote the wrong slot's form", never a near-miss typo.
 *  5. Find every OTHER noun dimension of the SAME NUMBER (sg vs pl, matching the expected
 *     slot's own number) whose accepted answers contain the normalized answer. If exactly
 *     one such dimension exists, record an unordered `{expectedCase, foundCase}` pair — an
 *     ambiguous match (0 or 2+ candidate dimensions) is not attributed to any single pair,
 *     the task's own "не гадай" spirit already established elsewhere in this task.
 *  6. Aggregate a count per unordered case pair across every word/log.
 *  7. Only pairs with `count >= CONFUSION_SIGNIFICANCE_THRESHOLD` are returned — "не после
 *     двух ошибок" (task text's own acceptance wording), see that constant's own comment.
 *  8. Sorted by count descending; each pair carries up to 5 example `WordId`s it was
 *     observed on, for the "Потренировать" button's candidate-word source.
 *
 * `Paradigm`/`WordIndexEntry` lookups are cached per-`wordId` within one `getConfusionMatrix()`
 * call (a `Map`, function-local — not a module-level cache like `stats.repository.ts`'s
 * denominators, since this reads `reviewLogs`, which changes after every session and must
 * never serve stale aggregates) so a word appearing in many wrong logs is only decoded once.
 */
import { db } from '../database.ts'
import type { CaseValue } from '@/content/codec.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { getParadigm } from '@/content/paradigms.ts'
import { enumerateSkills } from '@/learning/skills/enumerate.ts'
import { decodeSkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'

/**
 * "Не после двух ошибок" (task text's acceptance wording, verbatim) — 3 is the smallest
 * count that's unambiguously "more than two". Exported so the UI/tests can refer to the
 * same constant rather than re-hard-coding the number.
 */
export const CONFUSION_SIGNIFICANCE_THRESHOLD = 3

/** Up to this many example words are carried per pair, for the "Потренировать" button's
 *  candidate-word source (`features/stats/**`). */
const MAX_EXAMPLE_WORDS_PER_PAIR = 5

export interface ConfusionPair {
  readonly caseA: CaseValue
  readonly caseB: CaseValue
  readonly count: number
  readonly exampleWordIds: readonly WordId[]
}

function normalizeAnswer(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** `noun:<sg|pl>:<case>` -> `{ number, caseValue }`; anything else -> `undefined`. */
function nounSlotOf(dimension: Dimension): { number: 'sg' | 'pl'; caseValue: CaseValue } | undefined {
  const parts = dimension.split(':')
  if (parts[0] !== 'noun') return undefined
  const number = parts[1]
  const caseValue = parts[2]
  if (number !== 'sg' && number !== 'pl') return undefined
  if (!caseValue) return undefined
  return { number, caseValue: caseValue as CaseValue }
}

/** Unordered pair key — `"dative|genitive"` and `"genitive|dative"` collapse to the same
 *  aggregate, sorted alphabetically so the key is stable regardless of which case was
 *  "expected" vs "found" on any given log row. */
function pairKey(a: CaseValue, b: CaseValue): string {
  return [a, b].sort().join('|')
}

interface WordLookup {
  readonly answersByDimension: ReadonlyMap<Dimension, readonly string[]>
}

async function resolveWordLookup(
  wordId: WordId,
  cache: Map<WordId, WordLookup | null>,
): Promise<WordLookup | null> {
  const cached = cache.get(wordId)
  if (cached !== undefined) return cached

  const entry = getIndexStore().byId.get(wordId)
  const paradigm = entry ? await getParadigm(wordId) : null
  if (!entry || !paradigm) {
    cache.set(wordId, null)
    return null
  }

  const answersByDimension = new Map<Dimension, readonly string[]>()
  for (const descriptor of enumerateSkills(entry, paradigm)) {
    if (descriptor.kind === 'noun') answersByDimension.set(descriptor.dimension, descriptor.acceptedAnswers)
  }
  const lookup: WordLookup = { answersByDimension }
  cache.set(wordId, lookup)
  return lookup
}

export async function getConfusionMatrix(): Promise<ConfusionPair[]> {
  // Step 1 — no Dexie index exists on `correct` (`database.ts`'s `reviewLogs` index string
  // is `'++id, skillId, wordId, reviewedAt, sessionId, [wordId+reviewedAt]'`), so this reads
  // every log once and filters in memory. Acceptable for a `/stats`-screen aggregate (not a
  // hot path) — see this task's own report for the size this was verified against.
  const allLogs = await db.reviewLogs.toArray()
  const wrongLogs = allLogs.filter((log) => !log.correct)

  const wordLookupCache = new Map<WordId, WordLookup | null>()
  const counts = new Map<string, { caseA: CaseValue; caseB: CaseValue; count: number; words: Set<WordId> }>()

  for (const log of wrongLogs) {
    const { wordId, dimension } = decodeSkillId(log.skillId)
    const expectedSlot = nounSlotOf(dimension)
    if (!expectedSlot) continue // step 2: noun:*:* only

    const lookup = await resolveWordLookup(wordId, wordLookupCache)
    if (!lookup) continue // step 3: no paradigm / unknown word

    const normalizedAnswer = normalizeAnswer(log.answerGiven)

    // Step 5: every OTHER noun dimension of the same number whose accepted answers contain
    // the normalized answer.
    const matches: CaseValue[] = []
    for (const [otherDimension, accepted] of lookup.answersByDimension) {
      if (otherDimension === dimension) continue
      const otherSlot = nounSlotOf(otherDimension)
      if (!otherSlot || otherSlot.number !== expectedSlot.number) continue
      if (accepted.some((form) => normalizeAnswer(form) === normalizedAnswer)) {
        matches.push(otherSlot.caseValue)
      }
    }
    if (matches.length !== 1) continue // ambiguous or no match — not attributed anywhere

    const foundCase = matches[0]!
    if (foundCase === expectedSlot.caseValue) continue // same case, e.g. an alternate spelling
    const key = pairKey(expectedSlot.caseValue, foundCase)
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
      existing.words.add(wordId)
    } else {
      const [caseA, caseB] = [expectedSlot.caseValue, foundCase].sort() as [CaseValue, CaseValue]
      counts.set(key, { caseA, caseB, count: 1, words: new Set([wordId]) })
    }
  }

  return [...counts.values()]
    .filter((entry) => entry.count >= CONFUSION_SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      caseA: entry.caseA,
      caseB: entry.caseB,
      count: entry.count,
      exampleWordIds: [...entry.words].slice(0, MAX_EXAMPLE_WORDS_PER_PAIR),
    }))
}
