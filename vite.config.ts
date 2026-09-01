/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `spec/architecture.md` §11: session-aware update prompt is task 25's job — this app
      // never calls `updateSW()` yet, so with 'prompt' a waiting new SW simply sits until a
      // future task wires the "Доступна новая версия" banner. 'autoUpdate' would instead
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
        // App shell: HTML/JS/CSS, icons, fonts. `content/manifest.json` + `content/index.json`
        // + `content/senses/*.json` are precached explicitly below (architecture.md §11);
        // `content/paradigms/*.json` (64 shards, ~6.6 MB) is deliberately excluded — it's
        // task 25's runtime `CacheFirst` cache, not the initial precache.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,woff,woff2}',
          'content/manifest.json',
          'content/index.json',
          'content/senses/*.json',
        ],
        globIgnores: ['content/paradigms/**'],
        navigateFallbackDenylist: [/^\/content\//],
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
