/**
 * The in-memory word index (`spec/tasks/04-content-access-layer.md` §2).
 *
 * Built at startup (`initIndexStore`, called by `app/providers/ContentProvider` after
 * `loadIndex()` resolves) from the already-decoded `WordIndexEntry[]`. Every other
 * `content/**` module that needs to look words up (`query.ts`, `paradigms.ts`, `senses.ts`)
 * reads the resulting singleton via `getIndexStore()` rather than threading it through
 * function parameters — this mirrors the task's own `queryWords(q, progress)` signature,
 * which takes no index argument.
 *
 * Task 51 (`spec/tasks/51-language-profile.md` §2), widened to a set of languages by task 52: the
 * index is built for the languages the learner knows — `WordIndexEntry.level` is their level of
 * the word (`lang-profile.ts#levelForKnownLangs`), so the level gate, filters and `/stats`, which
 * all read `level`/`byLevel`, follow the languages without knowing about them.
 * `setIndexStoreLangs` (driven by `ContentProvider`, which watches the setting) swaps the
 * singleton for the other set's index — a NEW object, so anything keyed on its identity
 * (`useMemo`/`useLiveQuery` deps via `hooks/useKnownLangs.ts#useContentIndex`, `query.ts`'s
 * per-index caches) recomputes — and notifies `subscribeIndexStore` listeners. Each set's index
 * is built at most once per load and reused when switching back; the same set in another order is
 * the same set.
 */
import type { PosValue } from './codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'
import {
  canonicalKnownLangs,
  DEFAULT_KNOWN_LANGS,
  knownLangsKey,
  levelForKnownLangs,
  type KnownLangs,
} from '@/learning/session/lang-profile.ts'

/** Precomputed search text for one word — lowercased, diacritics stripped (see
 *  {@link normalizeSearchText}), computed once at index-build time instead of per query. */
export interface SearchTokens {
  readonly lemma: string
  readonly ru: string
}

export interface ContentIndex {
  readonly byId: ReadonlyMap<WordId, WordIndexEntry>
  /** Already sorted by frequency rank ascending — the content pipeline guarantees
   *  `index.json` rows come out in rank order, so this is `loadIndex()`'s array as-is (with
   *  the profile's `level` swapped in, task 51 — a copy only when some level differs). */
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

/** `entry` with `level` set to the learner's level of it — the same object when it already is
 *  (always, for Russian only: the loader decodes `level` as `levels.ru`). */
function withKnownLangsLevel(entry: WordIndexEntry, langs: KnownLangs): WordIndexEntry {
  const level = levelForKnownLangs(entry.levels, langs)
  return entry.level === level ? entry : { ...entry, level }
}

export function buildIndexStore(
  decodedRows: readonly WordIndexEntry[],
  langs: KnownLangs = DEFAULT_KNOWN_LANGS,
): ContentIndex {
  // The input array itself when no row changes (Russian only, on real data), so `byRank`
  // stays `loadIndex()`'s array as-is.
  const rows = decodedRows.some((entry) => entry.level !== levelForKnownLangs(entry.levels, langs))
    ? decodedRows.map((entry) => withKnownLangsLevel(entry, langs))
    : decodedRows
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
// Singleton — built by ContentProvider, read by every other content/** module.
// ---------------------------------------------------------------------------

let singleton: ContentIndex | null = null
/** The languages `singleton` was built for — one canonical object per set, so it is a stable
 *  `useSyncExternalStore` snapshot (`hooks/useKnownLangs.ts`). */
let singletonLangs: KnownLangs = DEFAULT_KNOWN_LANGS
/** The decoded rows `initIndexStore` got — what `setIndexStoreLangs` rebuilds from. */
let sourceRows: readonly WordIndexEntry[] | null = null
/** Every set's index built since the last `initIndexStore` (by {@link knownLangsKey}), so
 *  switching back is free and hands out the very same object (and so the same `query.ts`
 *  caches) — and the same canonical `langs` object. */
const builtByLangs = new Map<string, { readonly langs: KnownLangs; readonly index: ContentIndex }>()
const listeners = new Set<() => void>()

/** The built index for `langs`, built from `rows` on first use. */
function indexFor(rows: readonly WordIndexEntry[], langs: KnownLangs) {
  const canonical = canonicalKnownLangs(langs)
  const key = knownLangsKey(canonical)
  let built = builtByLangs.get(key)
  if (!built) {
    built = { langs: canonical, index: buildIndexStore(rows, canonical) }
    builtByLangs.set(key, built)
  }
  return built
}

export function initIndexStore(
  rows: readonly WordIndexEntry[],
  langs: KnownLangs = DEFAULT_KNOWN_LANGS,
): ContentIndex {
  sourceRows = rows
  builtByLangs.clear()
  const built = indexFor(rows, langs)
  singletonLangs = built.langs
  singleton = built.index
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

/** The languages the current index was built for — {@link DEFAULT_KNOWN_LANGS} before
 *  `initIndexStore`. The same object for as long as the set does not change. */
export function getIndexStoreLangs(): KnownLangs {
  return singletonLangs
}

/**
 * Switches the index to the set `langs` (tasks 51, 52): a no-op when it already is, otherwise the
 * singleton becomes that set's index (built from the same rows on first use) and every
 * {@link subscribeIndexStore} listener is called. An empty list is Russian only. Throws before
 * `initIndexStore`, like `getIndexStore`.
 */
export function setIndexStoreLangs(langs: KnownLangs): ContentIndex {
  const rows = sourceRows
  if (!singleton || !rows) return getIndexStore()

  const built = indexFor(rows, langs)
  if (built.langs === singletonLangs) return singleton

  singleton = built.index
  singletonLangs = built.langs
  for (const listener of listeners) listener()
  return singleton
}

/** `useSyncExternalStore`-shaped subscription to profile switches; returns the unsubscribe. */
export function subscribeIndexStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only: clears the singleton so test files don't leak state into each other. */
export function __resetIndexStoreForTest(): void {
  singleton = null
  singletonLangs = DEFAULT_KNOWN_LANGS
  sourceRows = null
  builtByLangs.clear()
}
