import { describe, expect, it } from 'vitest'
import type { Exercise } from './exercise.types.ts'

// ---------------------------------------------------------------------------
// Acceptance: "Добавление нового типа упражнения не требует изменений в session-runner".
//
// There's no session-runner yet (task 13) to prove this against directly, but the design
// choice that *enables* it is entirely inside this task: consumers must be able to key off
// `exercise.type` alone via a `Record<Exercise['type'], ...>` registry
// (`spec/architecture.md` §7.1). The `satisfies`-checked object below is exactly that
// registry shape — if a future 8th exercise type is added to the `Exercise` union without a
// matching entry here, `tsc`/`vitest` fails to compile, which is the same guarantee a real
// `Record<Exercise['type'], ComponentType<...>>` in a session-runner would get "for free"
// from the type checker, without this test (or that runner) needing to enumerate the union
// by hand anywhere else.
// ---------------------------------------------------------------------------

describe('Exercise union — registry-friendliness (acceptance)', () => {
  it('is keyable by `type` alone into a complete, exhaustive registry', () => {
    const registry = {
      choice: 'renders as multiple choice',
      input: 'renders as free text input',
      'self-assess': 'renders as reveal + rate',
      'form-input': 'renders as a form-fill input',
      'form-choice': 'renders as a form-fill multiple choice',
      table: 'renders as a full paradigm table',
      matching: 'renders as a matching pairs grid',
    } satisfies Record<Exercise['type'], string>

    expect(Object.keys(registry).sort()).toEqual(
      ['choice', 'input', 'self-assess', 'form-input', 'form-choice', 'table', 'matching'].sort(),
    )
  })
})

// ---------------------------------------------------------------------------
// Acceptance: "Ни одного импорта React в learning/exercises/**". Enforced structurally by
// eslint.config.js's `no-restricted-imports` rule for all of `src/learning/**` (`npm run
// lint` fails otherwise) — this test is a second, independent check that scans the actual
// source text, so the guarantee holds even if the lint rule is ever loosened.
// ---------------------------------------------------------------------------

describe('learning/exercises/** — no React import (acceptance)', () => {
  // `import.meta.glob` with `?raw` (Vite's own asset-loading mechanism, resolved by Vitest
  // the same way) reads every sibling source file's text at test time without touching
  // Node's `fs`/`path` — `src/**` isn't a Node TS project (no `@types/node`), so this stays
  // portable with the rest of the app code instead of needing a special-cased tsconfig.
  const sourceFiles = import.meta.glob<string>('./*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const nonTestFiles = Object.entries(sourceFiles).filter(([path]) => !path.endsWith('.test.ts'))

  it("found the expected source files (sanity check the scan isn't vacuous)", () => {
    expect(nonTestFiles.length).toBeGreaterThanOrEqual(5)
  })

  it.each(nonTestFiles)('%s does not import React or react-dom', (_path, contents) => {
    expect(contents).not.toMatch(/from ['"]react(-dom)?['"]/)
    expect(contents).not.toMatch(/require\(['"]react(-dom)?['"]\)/)
  })
})
