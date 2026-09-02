/**
 * Deletes orphaned `paradigms-*` / `senses-*` Cache Storage entries left behind by a
 * previous `contentVersion` (`spec/tasks/25-offline-update.md` §2: "старые кэши удаляются в
 * activate").
 *
 * DECISION LOG: `vite-plugin-pwa`'s `strategies: 'generateSW'` (`architecture.md` §11,
 * required — not `injectManifest`) only lets `workbox.cleanupOutdatedCaches` clean up its
 * *own* internally-prefixed precache caches on the service worker's `activate` event; it has
 * no hook for deleting a runtime `CacheFirst` cache under a caller-supplied name like
 * `paradigms-<oldVersion>` on activate without dropping into `injectManifest` (a raw,
 * hand-maintained service worker) or a `workbox.importScripts` side-file duplicating the
 * version logic already computed once, in `vite.config.ts`. Both are more moving parts than
 * this task's actual requirement — "the old cache doesn't linger forever" — needs.
 *
 * This module achieves the same outcome from the client instead: it runs once per app boot
 * (`ContentProvider.tsx`, right after the manifest resolves, fire-and-forget), reads the
 * *live* `contentVersion` the app just loaded, and deletes any `paradigms-`/`senses`-
 * prefixed cache that doesn't match it. Functionally equivalent to an activate-time cleanup
 * for this app's actual deployment model (a new `contentVersion` is only ever observed by
 * opening the app with the new build already active), and it can be exercised by a plain
 * unit test instead of a service-worker integration test.
 */
import { paradigmCacheName, sensesCacheName } from './cache-names.ts'

export async function cleanupStaleContentCaches(contentVersion: string): Promise<void> {
  if (typeof caches === 'undefined') return

  const keep = new Set([paradigmCacheName(contentVersion), sensesCacheName(contentVersion)])
  const keys = await caches.keys()
  const stale = keys.filter(
    (key) => (key.startsWith('paradigms-') || key.startsWith('senses-')) && !keep.has(key),
  )
  await Promise.all(stale.map((key) => caches.delete(key)))
}
