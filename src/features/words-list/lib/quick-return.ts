/**
 * Pure math behind the `/words` "quick return" filter chrome (`useQuickReturnChrome`).
 *
 * `offset` is how many pixels of the chrome are tucked up out of view: 0 = fully shown,
 * `height` = fully hidden. It follows the list's scroll 1:1 in both directions, with one
 * extra bound: it never exceeds `scrollTop`, so near the top of the list the chrome stays
 * glued to the content instead of exposing the empty `paddingStart` band above row 0.
 */

export function followScroll(
  offset: number,
  delta: number,
  scrollTop: number,
  height: number,
): number {
  const max = Math.min(height, Math.max(0, scrollTop))
  return Math.min(max, Math.max(0, offset + delta))
}

export type SnapTarget =
  | { kind: 'none' }
  /** Animate the chrome itself to this offset. */
  | { kind: 'offset'; to: number }
  /** Scroll the list to this `scrollTop`; the chrome follows via `followScroll`. */
  | { kind: 'scroll'; to: number }

/**
 * Where a half-tucked chrome settles once scrolling stops: by position, not by the last
 * scroll direction — so a small upward nudge while reading slides it back out of the way,
 * and only a deliberate pull (past half its height) opens it.
 */
export function snapTarget(offset: number, scrollTop: number, height: number): SnapTarget {
  if (height <= 0 || offset <= 0 || offset >= height) return { kind: 'none' }
  if (offset < height / 2) return { kind: 'offset', to: 0 }
  // Hiding fully here would uncover the empty band above row 0 — scroll the content up instead.
  if (scrollTop < height) return { kind: 'scroll', to: height }
  return { kind: 'offset', to: height }
}
