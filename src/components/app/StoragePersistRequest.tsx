/**
 * Requests persistent storage (`navigator.storage.persist()`) once the user has actually
 * started learning (`spec/tasks/25-offline-update.md` §6: "запрашивать после того, как
 * пользователь реально начал учиться (запрос на пустом приложении пользователи отклоняют)").
 * Persistent storage tells the browser not to silently evict IndexedDB/Cache Storage under
 * disk pressure without asking — worth having once there's real progress and cached content
 * worth protecting, not on an empty first launch nobody's invested in yet.
 *
 * Renders nothing. `requestedRef` makes this at most one `persist()` call per mounted
 * lifetime of the app (further calls are harmless — the browser just re-answers with
 * whatever it already decided — but there's no reason to re-ask on every render once
 * `hasAnySkill` flips true and stays true).
 */
import { useEffect, useRef } from 'react'
import { useHasAnySkill } from '@/hooks/useHasAnySkill.ts'

export function StoragePersistRequest() {
  const hasAnySkill = useHasAnySkill()
  const requestedRef = useRef(false)

  useEffect(() => {
    if (!hasAnySkill || requestedRef.current) return
    requestedRef.current = true
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      void navigator.storage.persist()
    }
  }, [hasAnySkill])

  return null
}
