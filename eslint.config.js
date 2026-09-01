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
  {
    // `src/learning/**` is the pure domain layer (architecture.md §3): no React, no Dexie,
    // no `features/**`. Enforced here rather than left as a convention — task 03 acceptance.
    files: ['src/learning/**/*.{ts,tsx}'],
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
          ],
        },
      ],
    },
  },
  {
    // Only `src/db/**` may import the live Dexie `db` instance / `PolishLearningDatabase`
    // class directly (architecture.md §3, §11 "Do not call IndexedDB APIs directly from
    // React components", task 05 acceptance point 7 / NFR-12). Everywhere else — components,
    // hooks in `src/hooks/**`, `features/**`, `learning/**` — must go through the typed
    // functions in `src/db/repositories/**` (or the `useLiveQuery`-based hooks that wrap
    // them), never `db.table(...)` / `db.skills....` etc. directly.
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/db/**/*.{ts,tsx}'],
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
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
])
