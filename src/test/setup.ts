import '@testing-library/jest-dom/vitest'
// jsdom has no IndexedDB implementation; `src/db/**` (task 05) needs a real (if in-memory)
// one for Dexie to run against in tests. Importing for side effects installs `indexedDB` /
// `IDBKeyRange` on `globalThis`, exactly like a real browser would provide them.
import 'fake-indexeddb/auto'
