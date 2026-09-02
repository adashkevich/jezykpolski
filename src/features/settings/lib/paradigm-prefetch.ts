/**
 * Offline paradigm-shard prefetch (`spec/tasks/24-settings-backup.md` §1/§5, FR-134): "Скачать
 * все формы для офлайна" fetches all 64 `public/content/paradigms/NNN.json` shards into Cache
 * Storage up front, so morphology tables/exercises work offline for a word the user has never
 * actually opened yet — without this, a shard is only cached once `content/loader.ts#
 * loadParadigmShard` happens to fetch it during normal browsing.
 *
 * SCOPE BOUNDARY (resolved by the supervisor, logged here per the task's own decision-log
 * requirement): task 25 ("Офлайн, кэширование...", not yet built) owns the *service worker's*
 * `CacheFirst` runtime cache for the same `content/paradigms/*.json` requests — this task must
 * not touch `vite.config.ts`'s `VitePWA`/workbox config, only use the plain Cache Storage API
 * directly (`caches.open` + `fetch` + `cache.put`). The two are made to cooperate, not
 * conflict, by using the EXACT SAME cache name convention task 25 will declare for its own
 * runtime cache: `` `paradigms-${contentVersion}` ``. Once task 25 exists, a shard this module
 * already fetched is a cache hit for the service worker's `CacheFirst` strategy too (same
 * cache, same key — a Cache Storage entry doesn't know or care which caller populated it), and
 * conversely a shard the service worker fetches during normal browsing satisfies this module's
 * own `cache.match` skip-if-present check on a later "Скачать всё" run. Whichever task ships
 * first, the other slots in without a migration.
 *
 * `contentVersion` (the cache-name suffix) is intentionally sourced from the live content
 * manifest (`useContent().manifest.contentVersion`, passed in by the caller — see
 * `../components/ParadigmPrefetchToggle.tsx`), not `meta.repository.ts#getContentVersion`.
 * `backup.repository.ts`'s own header has the full reasoning: `meta.contentVersion` is never
 * actually written by anything in the app today, and task 25's own cache-name suffix — baked
 * in at SW-build time from `public/content/manifest.json` — could only ever match the
 * manifest's value anyway, never a runtime IndexedDB read.
 */
import { PARADIGMS_SHARD_COUNT, shardFileStem } from '@/content/codec.ts'

export function paradigmCacheName(contentVersion: string): string {
  return `paradigms-${contentVersion}`
}

/** Mirrors `content/loader.ts#contentUrl`'s own `BASE_URL`-aware join — duplicated rather
 *  than imported because that function isn't exported (task 04's module keeps it private),
 *  and re-deriving three lines of pure path-joining here is cheaper than widening that
 *  module's public surface for a task-24-only caller. */
function paradigmShardUrl(shardIndex: number): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}content/paradigms/${shardFileStem(shardIndex)}.json`
}

export interface PrefetchProgress {
  readonly done: number
  readonly total: number
}

/** Thrown when `prefetchAllParadigmShards` is aborted via its `signal` — callers checking
 *  "was this a user cancel, not a real failure" should check `error.name === 'AbortError'`
 *  (the standard `DOMException` shape `fetch` itself throws for the same reason, so a caller
 *  that already handles a `fetch` abort handles this uniformly too). */
export function isAbortError(error: unknown): boolean {
  // Deliberately not `error instanceof Error` — `DOMException` (what both `fetch`'s own
  // abort and this module's manual `throw new DOMException(..., 'AbortError')` produce)
  // does not extend `Error` in the DOM spec, only `Error`-shaped duck typing (`.name`) is
  // reliable across both a real `AbortError` DOMException and a plain `Error` some other
  // layer might wrap it in.
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  )
}

/**
 * Fetches every paradigm shard not already present in `paradigms-${contentVersion}` and
 * `cache.put`s it, reporting progress after each shard (found-already-cached or freshly
 * fetched — both advance `done`, task text §5's "индикатор прогресса" doesn't distinguish the
 * two). Cooperative cancellation via `signal` (task text §5 "отменяемо"): checked before each
 * shard, and passed to `fetch` itself so an in-flight request is aborted immediately rather
 * than left to finish. Sequential, not parallel — 64 requests of ~15 KB each (task's own "~1
 * МБ" total) has no meaningful latency win from concurrency here, and sequential keeps the
 * reported `done` count exact and monotonic for the progress bar.
 */
export async function prefetchAllParadigmShards(
  contentVersion: string,
  onProgress: (progress: PrefetchProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const cache = await caches.open(paradigmCacheName(contentVersion))
  let done = 0
  onProgress({ done, total: PARADIGMS_SHARD_COUNT })

  for (let shard = 0; shard < PARADIGMS_SHARD_COUNT; shard++) {
    if (signal.aborted) throw new DOMException('Prefetch cancelled', 'AbortError')

    const url = paradigmShardUrl(shard)
    const cached = await cache.match(url)
    if (!cached) {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(
          `paradigm prefetch: failed to fetch "${url}" (HTTP ${response.status})`,
        )
      }
      await cache.put(url, response)
    }

    done++
    onProgress({ done, total: PARADIGMS_SHARD_COUNT })
  }
}

/** Whether every one of the 64 shards is already sitting in `paradigms-${contentVersion}` —
 *  used to render the toggle as already-on without re-running the whole fetch loop (e.g. a
 *  fresh mount of `/settings` after a previous run completed, or after a service-worker
 *  runtime cache from task 25 already populated it independently — see this file's header). */
export async function isParadigmPrefetchComplete(contentVersion: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const cache = await caches.open(paradigmCacheName(contentVersion))
  const keys = await cache.keys()
  return keys.length >= PARADIGMS_SHARD_COUNT
}
