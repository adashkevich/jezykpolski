/**
 * Filtering, search and sorting over the word index (`spec/tasks/04-content-access-layer.md`
 * §3). Called on every filter-panel change against all 7998 words, so the whole module is
 * written around the perf rules the task calls out explicitly:
 *
 *  - no intermediate per-string allocations in the hot path — normalization happens once at
 *    index-build time (`index-store.ts`'s `searchTokens`), not per query;
 *  - the three precomputed, pre-sorted arrays (`byRank` / `byAlpha` / `byLevel`) are the
 *    starting point for every query — never a fresh `Array.prototype.sort()` per call;
 *  - one filter pass with a single combined predicate, not several `.filter()` chained calls;
 *  - results are memoized by a serialized query key.
 */
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { WordProgressRecord, WordStatus } from '@/types/progress.ts'
import type { LevelValue, PosValue } from './codec.ts'
import { LEVEL_VALUES } from './codec.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import { getIndexStore, normalizeSearchText, type ContentIndex } from './index-store.ts'

export interface WordQuery {
  /** Explicit multi-select of levels. */
  levels?: readonly LevelValue[]
  /** "up to level B1" = A1 + A2 + B1. Combined with `levels` via union, not intersection —
   *  either constraint being satisfied is enough (matching the UI's "one filter or the
   *  other", not "both must agree"). */
  upToLevel?: LevelValue
  pos?: readonly PosValue[]
  /** Requires progress data, supplied by the caller (this module has no DB access). */
  status?: readonly WordStatus[]
  topN?: 500 | 1000 | 2000 | 5000 | null
  search?: string
  sort: 'frequency' | 'level' | 'alphabetical'
}

const LEVEL_RANK: Readonly<Record<LevelValue, number>> = Object.fromEntries(
  LEVEL_VALUES.map((level, i) => [level, i]),
) as Record<LevelValue, number>

function baseArrayFor(index: ContentIndex, sort: WordQuery['sort']): readonly WordIndexEntry[] {
  switch (sort) {
    case 'alphabetical':
      return index.byAlpha
    case 'level':
      return index.byLevel
    case 'frequency':
      return index.byRank
  }
}

/** Stable, order-independent cache key for a query. Two queries that mean the same thing
 *  (e.g. `levels: ['B1', 'A1']` vs `['A1', 'B1']`) collapse to the same key. */
function serializeQuery(q: WordQuery): string {
  const normalizeList = (values: readonly string[] | undefined): string | null =>
    values && values.length > 0 ? [...values].sort().join(',') : null
  return JSON.stringify([
    normalizeList(q.levels),
    q.upToLevel ?? null,
    normalizeList(q.pos),
    normalizeList(q.status),
    q.topN ?? null,
    q.search ? normalizeSearchText(q.search) : null,
    q.sort,
  ])
}

// ---------------------------------------------------------------------------
// Memoization: results are cached per serialized query key, scoped first by `index`
// *identity* (`WeakMap`) — a fresh `ContentIndex` (e.g. `initIndexStore` re-run after a
// content-version update) starts with an empty cache instead of serving stale entries from
// the old index, and the old index's cache entries simply become unreachable and get GC'd.
//
// A query that doesn't filter by `status` never depends on `progress` at all, so within one
// index it lives in a single flat `Map` shared across calls regardless of which `progress`
// (if any) the caller passed. A query that *does* filter by `status` is additionally scoped
// to `progress` *by identity*: `progress` is mutable data owned by the caller (task 05's
// Dexie layer), and keying purely on the serialized query would silently return stale
// results once progress changes without the query itself changing. Callers are expected to
// pass a fresh `Map` when progress actually changes (the usual immutable-update pattern),
// which is exactly what invalidates this half of the cache.
// ---------------------------------------------------------------------------

function getOrCreate<K extends object, V>(map: WeakMap<K, V>, key: K, create: () => V): V {
  const existing = map.get(key)
  if (existing) return existing
  const created = create()
  map.set(key, created)
  return created
}

const statusIndependentCache = new WeakMap<ContentIndex, Map<string, WordIndexEntry[]>>()
const statusScopedCache = new WeakMap<
  ContentIndex,
  WeakMap<Map<WordId, WordProgressRecord>, Map<string, WordIndexEntry[]>>
>()

export function queryWords(
  q: WordQuery,
  progress: Map<WordId, WordProgressRecord> = new Map(),
  index: ContentIndex = getIndexStore(),
): WordIndexEntry[] {
  const needsStatus = q.status !== undefined && q.status.length > 0
  const cacheKey = serializeQuery(q)

  const byQuery = needsStatus
    ? getOrCreate(
        getOrCreate(statusScopedCache, index, () => new WeakMap()),
        progress,
        () => new Map<string, WordIndexEntry[]>(),
      )
    : getOrCreate(statusIndependentCache, index, () => new Map<string, WordIndexEntry[]>())

  const cached = byQuery.get(cacheKey)
  if (cached) return cached

  const levelSet = q.levels && q.levels.length > 0 ? new Set(q.levels) : null
  const upToRank = q.upToLevel !== undefined ? LEVEL_RANK[q.upToLevel] : null
  const posSet = q.pos && q.pos.length > 0 ? new Set(q.pos) : null
  const statusSet = q.status && q.status.length > 0 ? new Set(q.status) : null
  const normalizedSearch = q.search ? normalizeSearchText(q.search) : null
  const topN = q.topN ?? null

  const source = baseArrayFor(index, q.sort)
  const result: WordIndexEntry[] = []

  for (let i = 0; i < source.length; i++) {
    const entry = source[i]!

    if (topN !== null && entry.rank > topN) continue

    if (levelSet || upToRank !== null) {
      const inLevels = levelSet !== null && levelSet.has(entry.level)
      const inUpTo = upToRank !== null && LEVEL_RANK[entry.level] <= upToRank
      if (!inLevels && !inUpTo) continue
    }

    if (posSet && !posSet.has(entry.pos)) continue

    if (needsStatus) {
      const wordId = encodeWordId(entry.lemma, entry.pos)
      const record = progress.get(wordId)
      const status: WordStatus = record?.status ?? 'new'
      if (!statusSet!.has(status)) continue
    }

    if (normalizedSearch) {
      const tokens = index.searchTokens.get(encodeWordId(entry.lemma, entry.pos))
      const matches =
        tokens !== undefined &&
        (tokens.lemma.includes(normalizedSearch) || tokens.ru.includes(normalizedSearch))
      if (!matches) continue
    }

    result.push(entry)
  }

  byQuery.set(cacheKey, result)
  return result
}
