/**
 * Raw IndexedDB helpers for E2E assertions (`spec/tasks/26-quality-a11y-e2e.md` §2's
 * critical-flow scenario, step 10: "SRS-состояние навыка НЕ улучшилось от повтора ошибки").
 *
 * Deliberately uses the browser's native `indexedDB` API inside `page.evaluate` rather than
 * importing Dexie or any `src/db/**` module into the Playwright/Node process: an E2E test's
 * whole point is verifying what the *real, running app* persisted, through the same
 * `PolishLearningDB` (`src/db/database.ts`) instance the app itself opened — reaching for a
 * second, separate Dexie connection from Node would test a different thing (that Dexie's
 * client library works in isolation, already covered by every test file under `src/db/repositories/**`) and
 * would need its own IndexedDB polyfill in Node for no real benefit. `src/db/database.ts`'s
 * own header documents the DB name (`'PolishLearningDB'`) and schema version (1) this file
 * hard-codes below — this is the one place outside `src/db/**` allowed to know that shape,
 * for exactly this reason (an E2E test isn't subject to the `no-restricted-imports` rule
 * that keeps app code off direct IndexedDB access, since it isn't app code).
 */
import type { Page } from '@playwright/test'

/** Every row currently in `storeName`, read via a single readonly transaction. */
export async function dbGetAll<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate((storeName) => {
    return new Promise<unknown[]>((resolve, reject) => {
      const openReq = indexedDB.open('PolishLearningDB')
      openReq.onerror = () => reject(openReq.error)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction(storeName, 'readonly')
        const getAllReq = tx.objectStore(storeName).getAll()
        getAllReq.onsuccess = () => {
          resolve(getAllReq.result)
          db.close()
        }
        getAllReq.onerror = () => {
          reject(getAllReq.error)
          db.close()
        }
      }
    })
  }, storeName) as Promise<T[]>
}

/** Rows for exactly the given primary keys — `undefined` in the result for any key with no
 *  matching row (same as `IDBObjectStore#get`), same order as `keys`. */
export async function dbGetByKeys<T>(
  page: Page,
  storeName: string,
  keys: readonly string[],
): Promise<(T | undefined)[]> {
  if (keys.length === 0) return []
  return page.evaluate(
    ({ storeName, keys }) => {
      return new Promise<unknown[]>((resolve, reject) => {
        const openReq = indexedDB.open('PolishLearningDB')
        openReq.onerror = () => reject(openReq.error)
        openReq.onsuccess = () => {
          const db = openReq.result
          const tx = db.transaction(storeName, 'readonly')
          const store = tx.objectStore(storeName)
          const results: unknown[] = new Array(keys.length)
          let remaining = keys.length
          keys.forEach((key: string, i: number) => {
            const getReq = store.get(key)
            getReq.onsuccess = () => {
              results[i] = getReq.result
              remaining--
              if (remaining === 0) {
                resolve(results)
                db.close()
              }
            }
            getReq.onerror = () => {
              reject(getReq.error)
              db.close()
            }
          })
        }
      })
    },
    { storeName, keys },
  ) as Promise<(T | undefined)[]>
}

/** `window.history.state` for the current entry — React Router v8's `useNavigate(to,
 *  {state})` stores the caller's `state` object under the `usr` key of the History API's own
 *  `state` (verified live against this app's router: `SessionPage.tsx#goToResults` navigates
 *  with `{ state: { sessionId } }`, which is what every scenario below reads back). Survives
 *  a hard reload (`location.reload()`) because it's the browser's own history-entry state,
 *  not in-memory React state — exactly why the critical-flow scenario's reload step can still
 *  recover `sessionId` afterward. */
export async function getHistoryStateSessionId(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const state = window.history.state as { usr?: { sessionId?: number } } | null
    return state?.usr?.sessionId
  })
}

export const STORE = {
  skills: 'skills',
  reviewLogs: 'reviewLogs',
  wordProgress: 'wordProgress',
} as const
