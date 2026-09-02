#!/usr/bin/env node
/**
 * Post-build bundle/precache size budget check (`spec/tasks/26-quality-a11y-e2e.md` §4:
 * "Добавить в CI/скрипт сборки проверку размера: превышение бюджета — предупреждение с
 * цифрами", NFR-05/NFR-06).
 *
 * Runs via `npm run build`'s `postbuild` hook (see `package.json`), after `vite build` has
 * already written `dist/**` and `vite-plugin-pwa` has already generated `dist/sw.js`. Reads
 * the REAL precache list straight out of the generated `dist/sw.js` (the
 * `precacheAndRoute([...])` call workbox's `generateSW` mode emits) rather than re-deriving
 * it from `vite.config.ts`'s `globPatterns` — the actual emitted list is the ground truth for
 * "what a fresh install downloads before first offline use", and stays correct even if
 * `vite.config.ts`'s patterns change later without this script being touched.
 *
 * DECISION LOG (this task): `scripts/build-content.ts` already has its own budget check
 * (`PRECACHE_WARN_BYTES`, `INDEX_GZIP_WARN_BYTES`, `PARADIGMS_GZIP_BUDGET_BYTES`) — but that
 * one runs at `prebuild` time, before `vite build`, and only sees `public/content/**`
 * artifacts (`index.json`/`senses/*`/`paradigms/*`/`manifest.json`); it has no visibility
 * into the app shell's own JS/CSS bundle size or the final `dist/sw.js` precache list. This
 * script is the complementary *postbuild* check task 26 asks for: the actual gzip size of
 * the shipped JS/CSS bundle, and the actual gzip size of everything the generated service
 * worker precaches — the two numbers `spec/tasks/26-quality-a11y-e2e.md`'s own performance
 * table names ("JS/CSS" bundle, "Precache ≤ 500 КБ gz"). Deliberately does NOT re-check
 * `public/content/**` artifact sizes a second time — that stays `build-content.ts`'s job.
 *
 * Per the task text ("предупреждение с цифрами", not "ошибка сборки"): every check here
 * only ever `console.warn`s and always exits `0` — `spec/tasks/00-progress.md`'s own
 * decision-log entries (task 06/13/25) already document the one known, accepted precache
 * overage (icons + full Cyrillic/Latin font coverage pushing the FULL precache to ~577 KB
 * gz, against a budget written for "app shell + word index" specifically) as an intentional
 * deviation, not a bug to fail the build over.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST_DIR = join(ROOT, 'dist')
const SW_PATH = join(DIST_DIR, 'sw.js')

// NFR-05: "Начальная загрузка (app shell + индекс слов) ≤ 500 КБ gzip".
const APP_SHELL_AND_INDEX_BUDGET_BYTES = 500 * 1024
// Task 26 performance table's own "Precache ≤ 500 КБ gz" row, checked against the FULL
// generated precache list (icons/fonts included) — see this file's header for why that's
// tracked separately from the NFR-05-literal figure above, and why an overage here is a
// warning, not a failure (the already-documented, accepted deviation).
const FULL_PRECACHE_BUDGET_BYTES = 500 * 1024
// No single NFR names a bare JS+CSS number, but the task text's own budget table lists
// "JS/CSS" explicitly as one of the two things this script must check — reusing the NFR-05
// figure here is the closest defensible number: JS+CSS is a subset of "app shell", so it can
// never legitimately exceed the app shell's own budget.
const JS_CSS_BUDGET_BYTES = 500 * 1024

function fmtKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function gzipSize(absPath: string): number {
  return gzipSync(readFileSync(absPath)).length
}

/**
 * Parses the exact URL list out of `dist/sw.js`'s generated `precacheAndRoute([...])` call —
 * a plain regex scan for `"url":"..."` / `url:"..."` pairs is enough (workbox's `generateSW`
 * output is a single minified `define(...)` call, not something worth pulling in a JS parser
 * for). Every entry is a path relative to `dist/`.
 */
function readPrecacheUrls(swSource: string): string[] {
  const match = swSource.match(/precacheAndRoute\(\[(.*?)\]\s*,\s*\{\}\)/s)
  if (!match) {
    throw new Error(
      'check-bundle-size: could not find precacheAndRoute([...]) in dist/sw.js — has ' +
        'vite-plugin-pwa\'s output format changed? (see this script\'s own header)',
    )
  }
  const urls: string[] = []
  const urlPattern = /url:"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = urlPattern.exec(match[1]!)) !== null) {
    urls.push(m[1]!)
  }
  return urls
}

interface Bucket {
  readonly label: string
  readonly test: (url: string) => boolean
}

// Classification mirrors the decision log's own distinction (spec/tasks/00-progress.md,
// 2026-09-02 entries for task 25): "app shell (HTML/JS/CSS) + индекс слов" — NFR-05's literal
// wording — versus everything else the SW also precaches (PWA icons, `manifest.webmanifest`,
// the full Cyrillic+Latin font family) that NFR-05 doesn't literally name but the SW still
// has to ship for a working installed app.
const BUCKETS: readonly Bucket[] = [
  {
    label: 'app shell (html/js/css)',
    test: (u) => ['.html', '.js', '.css'].includes(extname(u)),
  },
  {
    label: 'word index (content/manifest.json + content/index.json)',
    test: (u) => u.startsWith('content/'),
  },
  {
    label: 'PWA assets (icons, favicon, manifest.webmanifest, fonts)',
    test: () => true, // catch-all — everything not matched by the two buckets above
  },
]

function classify(url: string): string {
  for (const bucket of BUCKETS) {
    if (bucket.test(url)) return bucket.label
  }
  return BUCKETS[BUCKETS.length - 1]!.label
}

function collectJsCssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      collectJsCssFiles(abs, out)
    } else if (extname(name) === '.js' || extname(name) === '.css') {
      out.push(abs)
    }
  }
  return out
}

function main() {
  if (!existsSync(SW_PATH)) {
    console.warn(
      `check-bundle-size: ${SW_PATH} not found — skipping (did \`vite build\` run with the ` +
        'PWA plugin enabled? this script only makes sense against a production build).',
    )
    return
  }

  const swSource = readFileSync(SW_PATH, 'utf-8')
  const precacheUrlsRaw = readPrecacheUrls(swSource)
  // Deduped by URL: `vite-plugin-pwa` legitimately lists a handful of URLs twice in the
  // generated `precacheAndRoute([...])` call (once from `globPatterns` matching the built
  // file, once again from the `includeAssets` option — e.g. every PWA icon plus
  // `favicon.svg`/`apple-touch-icon.png`) — verified against a real build (`grep -c 'url:"'
  // dist/sw.js` vs the unique URL count). A real service worker/browser Cache Storage still
  // only stores and downloads each unique URL once, so summing every array entry as if it
  // were a distinct download overstates the true precache total; this script counts each
  // URL's gzip size exactly once, matching what actually ships.
  const precacheUrls = [...new Set(precacheUrlsRaw)]

  let fullPrecacheGzip = 0
  let appShellAndIndexGzip = 0
  const byBucket = new Map<string, { count: number; gzip: number }>()
  const missing: string[] = []

  for (const url of precacheUrls) {
    const abs = join(DIST_DIR, url)
    if (!existsSync(abs)) {
      missing.push(url)
      continue
    }
    const gzip = gzipSize(abs)
    fullPrecacheGzip += gzip
    const bucket = classify(url)
    if (bucket !== 'PWA assets (icons, favicon, manifest.webmanifest, fonts)') {
      appShellAndIndexGzip += gzip
    }
    const entry = byBucket.get(bucket) ?? { count: 0, gzip: 0 }
    entry.count++
    entry.gzip += gzip
    byBucket.set(bucket, entry)
  }

  // JS+CSS across the whole `dist/assets/**` output, not just what's precached — the SW
  // precaches every emitted JS/CSS chunk today (no code-splitting into a lazy, non-precached
  // chunk yet), so in practice this equals the "app shell (html/js/css)" bucket's gzip total
  // minus the one HTML file, but computed independently here as a direct check against the
  // real `dist/` output rather than assuming that equivalence holds forever.
  const jsCssFiles = existsSync(join(DIST_DIR, 'assets'))
    ? collectJsCssFiles(join(DIST_DIR, 'assets'))
    : []
  const jsCssGzip = jsCssFiles.reduce((sum, f) => sum + gzipSize(f), 0)

  console.log('')
  console.log('=== Bundle size report (postbuild, dist/sw.js precache list) ===')
  console.log(`JS+CSS (dist/assets/**, ${jsCssFiles.length} files): ${fmtKb(jsCssGzip)} gz`)
  console.log('')
  console.log(`Precache (${precacheUrls.length} entries):`)
  for (const [label, { count, gzip }] of byBucket) {
    console.log(`  ${label.padEnd(58)} ${String(count).padStart(3)} files  ${fmtKb(gzip).padStart(10)} gz`)
  }
  console.log(`  ${'TOTAL'.padEnd(58)}          ${fmtKb(fullPrecacheGzip).padStart(10)} gz`)
  console.log('')
  console.log(`app shell + word index only (NFR-05 literal wording): ${fmtKb(appShellAndIndexGzip)} gz`)
  console.log('')

  if (missing.length > 0) {
    console.warn(`WARNING: ${missing.length} precache URL(s) listed in sw.js but not found in dist/:`)
    for (const url of missing) console.warn(`  - ${url}`)
    console.warn('')
  }

  const warnings: string[] = []
  if (jsCssGzip > JS_CSS_BUDGET_BYTES) {
    warnings.push(`JS+CSS ${fmtKb(jsCssGzip)} exceeds ${fmtKb(JS_CSS_BUDGET_BYTES)} budget`)
  }
  if (appShellAndIndexGzip > APP_SHELL_AND_INDEX_BUDGET_BYTES) {
    warnings.push(
      `app shell + word index ${fmtKb(appShellAndIndexGzip)} exceeds ${fmtKb(APP_SHELL_AND_INDEX_BUDGET_BYTES)} budget (NFR-05)`,
    )
  }
  if (fullPrecacheGzip > FULL_PRECACHE_BUDGET_BYTES) {
    warnings.push(
      `full precache ${fmtKb(fullPrecacheGzip)} exceeds ${fmtKb(FULL_PRECACHE_BUDGET_BYTES)} budget — ` +
        'KNOWN, ACCEPTED deviation (spec/tasks/00-progress.md decision log, task 25: icons + ' +
        'full font coverage push this over 500 KB even though the NFR-05-literal figure above ' +
        'stays under budget; not a regression unless that figure also grows)',
    )
  }

  if (warnings.length > 0) {
    console.warn('WARNINGS:')
    for (const w of warnings) console.warn(`  - ${w}`)
  } else {
    console.log('All size budgets OK.')
  }
  console.log('')
  // Deliberately always exits 0 — see this file's header ("предупреждение, не ошибка
  // сборки"). A future maintainer who wants this to fail CI on regression should change
  // this deliberately, not by this script accidentally throwing.
}

main()
