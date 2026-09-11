/**
 * "Quick return" for the `/words` filter chrome (POS tabs, level chips, "Найдено N" + filter
 * trigger, swipe hint) — everything between the search field and the list.
 *
 * The chrome is overlaid on top of the list (the list reserves its height via the
 * virtualizer's `paddingStart`) and slides up under the search field as the list scrolls
 * down, then back out as it scrolls up — both 1:1 with the finger (`followScroll`). Once
 * scrolling settles (no scroll events for `SNAP_DELAY_MS`, finger lifted), a half-tucked
 * chrome snaps to fully shown or fully hidden (`snapTarget`).
 *
 * Why an overlay + `transform` rather than animating a height: the list's box never
 * resizes, so there's no per-frame layout, no virtualizer re-measure, and no browser-clamped
 * `scrollTop` feeding back into the scroll handler. For the same reason the per-frame
 * offset is written straight to the DOM instead of going through React state.
 *
 * `enabled: false` (empty results — no list, chrome sits in normal flow) resets everything
 * so the filters that emptied the list are never left tucked away.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { followScroll, snapTarget } from '@/features/words-list/lib/quick-return.ts'

/** Idle time after the last scroll event before a half-tucked chrome snaps. */
const SNAP_DELAY_MS = 140
const SNAP_TRANSITION = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function useQuickReturnChrome(enabled: boolean) {
  const chromeRef = useRef<HTMLDivElement>(null)
  const [chromeHeight, setChromeHeight] = useState(0)
  const heightRef = useRef(0)
  const offsetRef = useRef(0)
  const lastTopRef = useRef<number | null>(null)
  const scrollElRef = useRef<HTMLElement | null>(null)
  const unbindTouchRef = useRef<(() => void) | null>(null)
  const touchingRef = useRef(false)
  const snapTimerRef = useRef<number | undefined>(undefined)

  const apply = useCallback((offset: number, animate: boolean) => {
    offsetRef.current = offset
    const chrome = chromeRef.current
    if (!chrome) return
    chrome.style.transition = animate && !prefersReducedMotion() ? SNAP_TRANSITION : ''
    chrome.style.transform = offset > 0 ? `translate3d(0, ${-offset}px, 0)` : ''
    // Fully tucked away: out of tab order and the accessibility tree.
    chrome.inert = heightRef.current > 0 && offset >= heightRef.current
  }, [])

  const snap = useCallback(() => {
    const el = scrollElRef.current
    if (!el || touchingRef.current) return
    const target = snapTarget(offsetRef.current, el.scrollTop, heightRef.current)
    if (target.kind === 'offset') apply(target.to, true)
    else if (target.kind === 'scroll') {
      el.scrollTo({ top: target.to, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
  }, [apply])

  const scheduleSnap = useCallback(() => {
    window.clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(snap, SNAP_DELAY_MS)
  }, [snap])

  // Don't snap out from under a finger that's resting on the list mid-gesture.
  const bindTouch = useCallback(
    (el: HTMLElement) => {
      unbindTouchRef.current?.()
      const down = () => {
        touchingRef.current = true
        window.clearTimeout(snapTimerRef.current)
      }
      const up = () => {
        touchingRef.current = false
        scheduleSnap()
      }
      el.addEventListener('touchstart', down, { passive: true })
      el.addEventListener('touchend', up)
      el.addEventListener('touchcancel', up)
      unbindTouchRef.current = () => {
        el.removeEventListener('touchstart', down)
        el.removeEventListener('touchend', up)
        el.removeEventListener('touchcancel', up)
      }
      scrollElRef.current = el
    },
    [scheduleSnap],
  )

  const onScroll = useCallback(
    (el: HTMLElement) => {
      if (scrollElRef.current !== el) bindTouch(el)
      const top = el.scrollTop
      const lastTop = lastTopRef.current
      lastTopRef.current = top
      // First call after (re)mount — the list hands over its restored offset as a baseline.
      if (lastTop === null) return

      const next = followScroll(offsetRef.current, top - lastTop, top, heightRef.current)
      if (next !== offsetRef.current) apply(next, false)
      scheduleSnap()
    },
    [apply, bindTouch, scheduleSnap],
  )

  // Chrome height → the list's `paddingStart`. Measured in a layout effect so the list's
  // first paint (including a restored scroll offset) already has the right padding.
  useLayoutEffect(() => {
    const chrome = chromeRef.current
    if (!chrome) return
    const measure = () => {
      const height = chrome.offsetHeight
      heightRef.current = height
      setChromeHeight(height)
      apply(Math.min(offsetRef.current, height), false)
    }
    measure()
    // Tabbing into a half-tucked chrome brings it fully into view.
    const reveal = () => apply(0, true)
    chrome.addEventListener('focusin', reveal)
    if (typeof ResizeObserver === 'undefined') {
      return () => chrome.removeEventListener('focusin', reveal)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(chrome)
    return () => {
      observer.disconnect()
      chrome.removeEventListener('focusin', reveal)
    }
  }, [apply])

  useLayoutEffect(() => {
    if (enabled) return
    window.clearTimeout(snapTimerRef.current)
    lastTopRef.current = null
    apply(0, false)
  }, [enabled, apply])

  useEffect(
    () => () => {
      window.clearTimeout(snapTimerRef.current)
      unbindTouchRef.current?.()
    },
    [],
  )

  return { chromeRef, chromeHeight, onScroll }
}
