/**
 * The in-memory word index (`spec/tasks/04-content-access-layer.md` §2).
 *
 * Built exactly once at startup (`initIndexStore`, called by `app/providers/ContentProvider`
 * after `loadIndex()` resolves) from the already-decoded `WordIndexEntry[]`. Every other
 * `content/**` module that needs to look words up (`query.ts`, `paradigms.ts`, `senses.ts`)
 * reads the resulting singleton via `getIndexStore()` rather than threading it through
 * function parameters — this mirrors the task's own `queryWords(q, progress)` signature,
 * which takes no index argument.
 */
import type { PosValue } from './codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'

/** Precomputed search text for one word — lowercased, diacritics stripped (see
 *  {@link normalizeSearchText}), computed once at index-build time instead of per query. */
export interface SearchTokens {
  readonly lemma: string
  readonly ru: string
}

export interface ContentIndex {
  readonly byId: ReadonlyMap<WordId, WordIndexEntry>
  /** Already sorted by frequency rank ascending — the content pipeline guarantees
   *  `index.json` rows come out in rank order, so this is `loadIndex()`'s array as-is. */
  readonly byRank: readonly WordIndexEntry[]
  /** Sorted with `Intl.Collator('pl')`, NOT `String.prototype.localeCompare`'s default
   *  locale — the default locale sorts `ą` after `z`; the Polish collator sorts it right
   *  after `a`, per the Polish alphabet. */
  readonly byAlpha: readonly WordIndexEntry[]
  /** Sorted by level (A1..C2), rank as the tie-breaker within a level. */
  readonly byLevel: readonly WordIndexEntry[]
  readonly byPos: ReadonlyMap<PosValue, readonly WordIndexEntry[]>
  /** wordId -> precomputed lowercase/diacritic-stripped search text, built once here so
   *  `query.ts`'s substring search never re-normalizes a string per query (perf budget). */
  readonly searchTokens: ReadonlyMap<WordId, SearchTokens>
}

// ---------------------------------------------------------------------------
// Polish diacritic normalization, shared by index building (lemma/translation) and query
// building (the user's search string) so both sides fold the same way — `zolty` must find
// `żółty`, `human` must find nothing surprising, etc.
// ---------------------------------------------------------------------------

/**
 * Lowercases and strips diacritics for substring search.
 *  - `ą ć ę ń ó ś ź` decompose under Unicode NFD into base letter + combining mark, so
 *    `normalize('NFD') + strip combining marks (U+0300-U+036F)` handles them.
 *  - `ł` (and `Ł`) do NOT have a canonical Unicode decomposition (it's a distinct letter,
 *    not "l" + a mark) — handled by an explicit replace before the NFD step.
 *  - `ż` also folds to plain `z` here (same bucket as `ź`) — search is deliberately lossy
 *    ("in поиске — да", per the task text), unlike answer-checking (task 09), which must
 *    tell `ż`/`ź` apart.
 */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const LEVEL_ORDER: Record<string, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
}

const polishCollator = new Intl.Collator('pl')

export function buildIndexStore(rows: readonly WordIndexEntry[]): ContentIndex {
  const byId = new Map<WordId, WordIndexEntry>()
  const byPosMutable = new Map<PosValue, WordIndexEntry[]>()
  const searchTokens = new Map<WordId, SearchTokens>()

  for (const entry of rows) {
    const wordId = encodeWordId(entry.lemma, entry.pos)
    byId.set(wordId, entry)
    searchTokens.set(wordId, {
      lemma: normalizeSearchText(entry.lemma),
      ru: normalizeSearchText(entry.primaryRu),
    })
    const bucket = byPosMutable.get(entry.pos)
    if (bucket) {
      bucket.push(entry)
    } else {
      byPosMutable.set(entry.pos, [entry])
    }
  }

  const byRank = rows
  const byAlpha = [...rows].sort((a, b) => polishCollator.compare(a.lemma, b.lemma))
  const byLevel = [...rows].sort((a, b) => {
    const levelDiff = (LEVEL_ORDER[a.level] ?? 0) - (LEVEL_ORDER[b.level] ?? 0)
    return levelDiff !== 0 ? levelDiff : a.rank - b.rank
  })

  const byPos = new Map<PosValue, readonly WordIndexEntry[]>(byPosMutable)

  return { byId, byRank, byAlpha, byLevel, byPos, searchTokens }
}

// ---------------------------------------------------------------------------
// Singleton — built once by ContentProvider, read by every other content/** module.
// ---------------------------------------------------------------------------

let singleton: ContentIndex | null = null

export function initIndexStore(rows: readonly WordIndexEntry[]): ContentIndex {
  singleton = buildIndexStore(rows)
  return singleton
}

export function getIndexStore(): ContentIndex {
  if (!singleton) {
    throw new Error(
      'getIndexStore: index store has not been initialized yet — ContentProvider must ' +
        'resolve loadIndex() and call initIndexStore() before any content/** query runs.',
    )
  }
  return singleton
}

/** Test-only: clears the singleton so test files don't leak state into each other. */
export function __resetIndexStoreForTest(): void {
  singleton = null
}
