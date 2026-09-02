/**
 * Background warm-up of all 16 `content/senses/*.json` shards into Cache Storage
 * (`spec/tasks/25-offline-update.md` §1's documented fallback for a measured precache
 * overage).
 *
 * DECISION LOG: the content pipeline's own report (`npm run build:content`) measures the
 * real precache total as 541.2 KB gz — `manifest.json` (0.4 KB) + `index.json` (125.9 KB) +
 * `senses/*.json` (414.8 KB) — against the 500 KB gz budget (NFR-05). The task text
 * anticipated exactly this: "если senses не помещаются вместе с бандлом, перевести их в
 * runtime-кэш с прогревом при первом запуске, а precache оставить только index.json."
 * `vite.config.ts` now precaches only `manifest.json` + `index.json` (191.3 KB combined with
 * the app shell — comfortably under budget); this module is the "прогрев" half of that
 * fallback, warming the same `CacheFirst` runtime cache `vite.config.ts` declares for senses
 * (`senses-${contentVersion}`, see `cache-names.ts`) so a word the user hasn't opened yet
 * still shows its full sense list offline.
 *
 * This is safe to skip: `content/index.json` already carries every word's `primaryRu` (task
 * 02/04's codec), so word-list rows and a word's single "основной перевод" never depended on
 * a senses shard being loaded — only `WordDetailPage`'s "все значения" block (FR-41,
 * `features/word-detail/hooks/useSenses.ts`) and `learning/exercises/distractors.ts`'s FR-92
 * translation-overlap check need the full shard, and the latter already falls back to
 * `primaryRu` for a shard that isn't resolved yet (`content/loader.ts`'s
 * `peekSensesShard` header). So an offline learn session works correctly even on a boot
 * where this warm-up never got to run (e.g. the very first launch happened offline) — it
 * just means FR-41's full sense list, and FR-92's overlap check, are less complete until a
 * later online boot successfully warms the cache.
 *
 * Deliberately silent and best-effort — unlike `features/settings/lib/paradigm-prefetch.ts`'s
 * user-facing "Скачать все формы" toggle (cancelable, with a progress bar), nothing here is
 * initiated or watched by the user: it just runs once, quietly, after every successful
 * `ContentProvider` boot (`ContentProvider.tsx` calls this fire-and-forget, never awaiting
 * it before rendering `children`). A shard already sitting in the cache is skipped (cheap
 * `cache.match` check, no network); any fetch failure — most commonly "this boot happens to
 * be offline" — stops the loop for this boot rather than firing 16 doomed requests in a row,
 * and simply gets retried on the next successful boot.
 */
import { SENSES_SHARD_COUNT, shardFileStem } from './codec.ts'
import { sensesCacheName } from './cache-names.ts'

/** Mirrors `content/loader.ts#contentUrl`'s `BASE_URL`-aware join — duplicated for the same
 *  reason `paradigm-prefetch.ts#paradigmShardUrl` duplicates it (that function isn't
 *  exported, and re-deriving three lines here is cheaper than widening its public surface
 *  for this module-only caller). */
function sensesShardUrl(shardIndex: number): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}content/senses/${shardFileStem(shardIndex)}.json`
}

export async function prewarmSensesCache(contentVersion: string): Promise<void> {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(sensesCacheName(contentVersion))

  for (let shard = 0; shard < SENSES_SHARD_COUNT; shard++) {
    const url = sensesShardUrl(shard)
    const cached = await cache.match(url)
    if (cached) continue

    try {
      const response = await fetch(url)
      if (response.ok) {
        await cache.put(url, response)
      }
    } catch {
      // Offline (or some other transient failure) — stop for this boot, retry next time.
      return
    }
  }
}
