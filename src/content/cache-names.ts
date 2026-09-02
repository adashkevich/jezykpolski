/**
 * Cache Storage naming convention for the two content-shard runtime caches
 * (`spec/tasks/25-offline-update.md` §2 for paradigms, §1's "перевести в runtime-кэш с
 * прогревом" fallback for senses — see `senses-prewarm.ts`'s header for why senses ended up
 * here too).
 *
 * Both names are `<kind>-${contentVersion}` — `contentVersion` baked into the cache name is
 * what gives "rebuild content with different data → old cache silently orphaned, new cache
 * starts empty and gets repopulated" for free, without any explicit migration
 * (`vite.config.ts`'s workbox `CacheFirst` rules use these same names; the client-side
 * `stale-cache-cleanup.ts` module is what actually deletes the orphaned ones).
 *
 * Kept in their own tiny, dependency-free module — not merged into `codec.ts` or
 * `features/settings/lib/paradigm-prefetch.ts` — specifically so `vite.config.ts` (a
 * Node-context build config that cannot resolve the app's `@/` path alias or import
 * browser-only code) can import it via a plain relative path, and so both the settings
 * screen's manual prefetch (task 24) and `vite.config.ts`'s own runtime-caching declaration
 * (task 25) share the exact same string-producing function instead of two copies that could
 * silently drift apart.
 */

export function paradigmCacheName(contentVersion: string): string {
  return `paradigms-${contentVersion}`
}

export function sensesCacheName(contentVersion: string): string {
  return `senses-${contentVersion}`
}
