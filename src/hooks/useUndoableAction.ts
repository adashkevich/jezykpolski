/**
 * Generic "do it now, offer a few seconds to undo" state machine (`spec/tasks/16-swipe-triage.md`
 * §4: "Toast «Отменить» на несколько секунд, полностью откатывающий изменение"). Used by both
 * the `/words` list's swipe/button triage (`WordsListPage.tsx`) and the word-detail card's
 * «Знаю»/«Не знаю» buttons (`WordActions.tsx`) — the two independent call sites task 16
 * touches — so the toast timer/dismiss/undo bookkeeping isn't duplicated between them.
 *
 * Deliberately just a timer + one pending slot, not a queue: a second `show()` call while one
 * is already pending replaces it outright (clearing the previous toast's timer) rather than
 * stacking two toasts — a user swiping several rows in quick succession only ever needs "undo
 * my last action", matching how e.g. Gmail's single-slot undo-send bar behaves.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_DURATION_MS = 5000

export interface PendingUndo {
  readonly message: string
}

export function useUndoableAction(durationMs: number = DEFAULT_DURATION_MS) {
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const undoRef = useRef<(() => void | Promise<void>) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Belt-and-suspenders: cancel any pending auto-dismiss timer if the owning component
  // unmounts mid-countdown (e.g. the user navigates away from `/words` right after a swipe).
  useEffect(() => clearTimer, [clearTimer])

  const show = useCallback(
    (message: string, undo: () => void | Promise<void>) => {
      clearTimer()
      undoRef.current = undo
      setPending({ message })
      timerRef.current = setTimeout(() => {
        undoRef.current = null
        setPending(null)
      }, durationMs)
    },
    [clearTimer, durationMs],
  )

  const confirmUndo = useCallback(async () => {
    clearTimer()
    const undo = undoRef.current
    undoRef.current = null
    setPending(null)
    if (undo) await undo()
  }, [clearTimer])

  const dismiss = useCallback(() => {
    clearTimer()
    undoRef.current = null
    setPending(null)
  }, [clearTimer])

  return { pending, show, confirmUndo, dismiss }
}
