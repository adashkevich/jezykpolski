/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { paradigmCacheName, sensesCacheName } from './src/content/cache-names.ts'

/**
 * `contentVersion` for the two runtime-caching cache names below (task 25, §2 for paradigms,
 * §1's fallback for senses — see `vite.config.ts`'s workbox block and
 * `src/content/senses-prewarm.ts`'s header). Read synchronously from the already-built
 * `public/content/manifest.json` — `package.json`'s `prebuild` script (`npm run
 * build:content`) always runs before `vite build`, so in a real production build this file
 * is guaranteed to already exist by the time this config module evaluates.
 *
 * Falls back to a fixed placeholder rather than throwing when the manifest is missing —
 * `vite.config.ts` is also loaded by `vite dev` and by Vitest (this same file configures
 * `test: {...}` below), neither of which runs `prebuild` first, and a checkout that hasn't
 * run `npm run build:content` yet would otherwise crash every `npm test`/`npm run dev`
 * invocation over a value that's only ever consumed by the *built* service worker.
 */
function readContentVersion(): string {
  const manifestPath = path.resolve(import.meta.dirname, 'public/content/manifest.json')
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as { contentVersion?: unknown }
    if (typeof manifest.contentVersion === 'string' && manifest.contentVersion.length > 0) {
      return manifest.contentVersion
    }
  } catch {
    // Missing/unreadable/malformed manifest.json — see this function's own header.
  }
  return 'dev'
}

const contentVersion = readContentVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `spec/architecture.md` §11: session-aware update prompt (task 25, now wired —
      // `src/components/app/UpdateBanner.tsx` calls `useRegisterSW`/`updateServiceWorker`,
      // gated on `session.store.ts`'s active-session flag). 'autoUpdate' would instead
      // reload users mid-exercise, which is exactly what NFR-17 forbids.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Polski — изучение польского',
        short_name: 'Polski',
        description:
          'Polski — офлайн-приложение для изучения польского языка: словарь, склонения, спряжения и интервальные повторения.',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Design tokens (`src/app/styles/globals.css`): dark `--background` (`oklch(0.145 0 0)`
        // ≈ `#0f172a`), matched by `index.html`'s <meta name="theme-color"> and by
        // `scripts/generate-icons.ts`'s icon backgrounds — keep all three in sync.
        theme_color: '#0f172a',
        background_color: '#0f172a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell: HTML/JS/CSS, icons, fonts, `content/manifest.json` + `content/index.json`
        // (architecture.md §11 / NFR-05's "app shell + индекс слов" budget).
        //
        // DECISION LOG (task 25 §1): the content pipeline (`npm run build:content`) measures
        // the real precache total as 541.2 KB gz if `content/senses/*.json` is included too
        // (manifest 0.4 + index 125.9 + senses 414.8) — over the 500 KB gz budget. The task
        // text's own documented fallback for exactly this measured case applies: senses
        // shards move to a runtime `CacheFirst` cache (below) warmed on first launch
        // (`src/content/senses-prewarm.ts`) instead of being precached. `content/index.json`
        // already carries every word's `primaryRu`, so this costs nothing for word-list rows
        // or a word's primary translation — only `WordDetailPage`'s full "все значения"
        // block needs a senses shard, and that's covered by the warm-up.
        //
        // `content/paradigms/*.json` (64 shards, ~6.6 MB) is excluded the same way, for the
        // same reason task 06 already gave: it's a runtime `CacheFirst` cache, not the
        // initial precache — but paradigms are lazy (loaded on-demand only when a word's
        // forms are actually expanded, task 24's own prefetch toggle is opt-in), not
        // eagerly warmed like senses.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff,woff2}',
          'content/manifest.json',
          'content/index.json',
        ],
        globIgnores: ['content/paradigms/**', 'content/senses/**'],
        navigateFallbackDenylist: [/^\/content\//],
        runtimeCaching: [
          {
            // `content/paradigms/NNN.json` shards — §2: loaded on demand by
            // `content/loader.ts#loadParadigmShard` (when a word's "Формы слова" block is
            // expanded) or eagerly by task 24's opt-in "Скачать все формы" toggle
            // (`features/settings/lib/paradigm-prefetch.ts`) — either way, the SAME cache
            // name (`paradigmCacheName`, from the shared `src/content/cache-names.ts`) makes
            // whichever one runs first satisfy the other's cache lookups too.
            urlPattern: /\/content\/paradigms\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: paradigmCacheName(contentVersion),
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 31536000, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // `content/senses/NNN.json` shards — see the `globIgnores` comment above.
            // `sensesCacheName` (same shared module) is what `senses-prewarm.ts` writes
            // into, so the eager warm-up and this route serve the exact same cache.
            urlPattern: /\/content\/senses\/.*\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: sensesCacheName(contentVersion),
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 31536000, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright owns e2e/** via its own test runner; keep Vitest scoped to src/**.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
})
