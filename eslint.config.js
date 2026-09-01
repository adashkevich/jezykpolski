import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'public/content']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    // shadcn/ui-generated primitives co-export `xVariants` (cva) helpers alongside the
    // component; this is vendor code we don't hand-author, so relax the fast-refresh rule here.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // ---------------------------------------------------------------------------------------
  // `no-restricted-imports` is split across several mutually-exclusive `files`/`ignores`
  // scopes below (fsrs-adapter / rest-of-learning / db-layer / everything-else) rather than
  // several overlapping blocks each restating one concern. ESLint's flat config merges
  // config objects that match the same file by shallow-merging their `rules` maps — when
  // two matching objects both set the *same* rule key (as the old two-block "learning
  // React/Dexie ban" + "db-instance ban" setup did for any file under `src/learning/**`),
  // the later object's array wins *entirely*, silently dropping the earlier one's patterns.
  // (Verified empirically: `import { useState } from 'react'` inside `src/learning/**`
  // produced zero lint errors before this restructuring, despite the rule below it.) Task
  // 11 adds a third `ts-fsrs`-isolation concern on the same rule key, which would only make
  // the collision worse — so this fixes the pre-existing collision by giving every file at
  // most one matching `no-restricted-imports` block, each restating its full pattern set.
  // ---------------------------------------------------------------------------------------
  {
    // `src/learning/srs/fsrs-adapter.ts` is the ONE file allowed to import `ts-fsrs`
    // (architecture.md §6.1, blueprint §13/§36.11, task 11 acceptance). It's still pure
    // domain layer otherwise: no React, no Dexie (package or `db` instance), no `features/**`.
    files: ['src/learning/srs/fsrs-adapter.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/learning/** is a pure domain layer and must not import React.',
            },
            {
              group: ['dexie', 'dexie/*'],
              message: 'src/learning/** is a pure domain layer and must not import Dexie.',
            },
            {
              group: ['**/features/**', '@/features/*', '@/features/**'],
              message: 'src/learning/** is a pure domain layer and must not import features/**.',
            },
            {
              group: ['**/db/database', '**/db/database.ts', '@/db/database', '@/db/database.ts'],
              message:
                'Only src/db/** may import the Dexie `db` instance directly. Use a repository ' +
                'function from src/db/repositories/** (or a hook from src/hooks/**) instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // `src/learning/**` is the pure domain layer (architecture.md §3): no React, no Dexie,
    // no `features/**`. Enforced here rather than left as a convention — task 03 acceptance.
    // `ts-fsrs` is banned here too — `fsrs-adapter.ts` (scoped out above) is the sole
    // exception (task 11 acceptance).
    files: ['src/learning/**/*.{ts,tsx}'],
    ignores: ['src/learning/srs/fsrs-adapter.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'src/learning/** is a pure domain layer and must not import React.',
            },
            {
              group: ['dexie', 'dexie/*'],
              message: 'src/learning/** is a pure domain layer and must not import Dexie.',
            },
            {
              group: ['**/features/**', '@/features/*', '@/features/**'],
              message: 'src/learning/** is a pure domain layer and must not import features/**.',
            },
            {
              group: ['**/db/database', '**/db/database.ts', '@/db/database', '@/db/database.ts'],
              message:
                'Only src/db/** may import the Dexie `db` instance directly. Use a repository ' +
                'function from src/db/repositories/** (or a hook from src/hooks/**) instead.',
            },
            {
              group: ['ts-fsrs', 'ts-fsrs/*'],
              message:
                'ts-fsrs may only be imported in src/learning/srs/fsrs-adapter.ts (architecture.md ' +
                '§6.1) — use its exported createInitialState/review/previewIntervals/isDue instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // `src/db/**` legitimately imports the `dexie` package and its own `database.ts` — only
    // the `ts-fsrs` isolation concern (task 11) applies to it.
    files: ['src/db/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['ts-fsrs', 'ts-fsrs/*'],
              message:
                'ts-fsrs may only be imported in src/learning/srs/fsrs-adapter.ts (architecture.md ' +
                '§6.1) — use its exported createInitialState/review/previewIntervals/isDue instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Everywhere else (components, hooks, features, pages, ...): only `src/db/**` may
    // import the live Dexie `db` instance directly (architecture.md §3, §11 "Do not call
    // IndexedDB APIs directly from React components", task 05 acceptance point 7 / NFR-12),
    // and only `fsrs-adapter.ts` may import `ts-fsrs` (task 11).
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/db/**/*.{ts,tsx}', 'src/learning/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db/database', '**/db/database.ts', '@/db/database', '@/db/database.ts'],
              message:
                'Only src/db/** may import the Dexie `db` instance directly. Use a repository ' +
                'function from src/db/repositories/** (or a hook from src/hooks/**) instead.',
            },
            {
              group: ['ts-fsrs', 'ts-fsrs/*'],
              message:
                'ts-fsrs may only be imported in src/learning/srs/fsrs-adapter.ts (architecture.md ' +
                '§6.1) — use its exported createInitialState/review/previewIntervals/isDue instead.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
])
