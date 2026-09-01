/**
 * `spec/tasks/11-srs.md` acceptance point 1: "`ts-fsrs` импортируется ровно в одном файле".
 * `eslint.config.js` enforces this too (see its `no-restricted-imports` blocks and their
 * header comment), but a repo-wide scan here makes the same guarantee part of `npm test`,
 * not only `npm run lint` — and fails loudly (with the offending file names) if it's ever
 * violated, rather than depending on every contributor's editor actually running ESLint.
 *
 * Uses Vite's `import.meta.glob` (raw-text, eager) rather than Node's `fs` — this file lives
 * under `src/**`, type-checked by `tsconfig.app.json`, which only has `vite/client` types
 * (no `node` types, no `import.meta.dirname`); `import.meta.glob` is exactly the browser-
 * safe, Vite-native equivalent of "read every source file's text" and is what `vite/client`
 * already provides types for.
 */
import { describe, expect, it } from 'vitest'

const ALLOWED_IMPORTER = 'src/learning/srs/fsrs-adapter.ts'
const TS_FSRS_IMPORT_RE = /(?:from|require\()\s*['"]ts-fsrs(?:\/[^'"]*)?['"]/

// Every .ts/.tsx file under src/, as raw source text, keyed by its path relative to the
// project root (e.g. "/src/learning/srs/fsrs-adapter.ts").
const sourceFiles = import.meta.glob('/src/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('ts-fsrs isolation', () => {
  it('is imported by exactly src/learning/srs/fsrs-adapter.ts, nowhere else', () => {
    const paths = Object.keys(sourceFiles)
    expect(paths.length).toBeGreaterThan(50) // sanity: the glob actually matched the repo

    const importers = paths
      .filter((path) => TS_FSRS_IMPORT_RE.test(sourceFiles[path]!))
      .map((path) => path.replace(/^\//, ''))

    expect(importers).toEqual([ALLOWED_IMPORTER])
  })
})
