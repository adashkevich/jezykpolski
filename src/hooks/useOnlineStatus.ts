/**
 * `useOnlineStatus` (`spec/tasks/25-offline-update.md` §4) — live `navigator.onLine`, kept
 * in sync via the `online`/`offline` window events.
 *
 * Used for two things, both purely informational — NFR-03/§4's "офлайн не должен блокировать
 * ничего из учебного цикла" means this hook must never gate rendering of the learn/session
 * flow, only explain *why* something else (an unfetched paradigm shard) didn't load:
 *  - `components/app/OfflineBanner.tsx` — an unobtrusive app-wide "нет подключения" strip;
 *  - `features/word-detail/components/FormsSection.tsx` — distinguishes "this shard fetch
 *    failed because we're offline" from any other fetch error.
 */
import { useEffect, useState } from 'react'

function readOnlineStatus(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(readOnlineStatus)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
