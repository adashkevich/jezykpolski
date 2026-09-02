/**
 * One `/words` list row (`spec/tasks/07-words-list.md` §2/§6, `spec/tasks/16-swipe-triage.md`).
 *
 * ```text
 * być
 * быть
 * VERB · A1 · #1                    [индикатор статуса] [X] [✓]
 * ```
 *
 * Rendered as a single `<Link>` (not a `<div>` + onClick) — the acceptance criterion "у
 * строк корректная семантика ссылки" plus plain keyboard operability (Tab focuses it, Enter
 * activates it) come for free from using the real element instead of reimplementing it.
 *
 * `VirtualWordList` gives every row the same fixed pixel height (`WORD_ROW_HEIGHT`,
 * `spec/tasks/07-words-list.md` §1: "проще и быстрее динамической"), so the optional
 * "Формы" bar (FR-46, step 5: appears for NOUN/VERB/ADJ once a specific POS tab is active)
 * cannot change the row's height depending on whether it renders — its track is always
 * present (reserving the same vertical space either empty or filled) and only its fill is
 * conditional.
 *
 * ---
 *
 * Swipe triage (task 16, FR-29): a horizontal drag on the row's foreground layer reveals a
 * colored background (red "Не знаю" on a left-drag, green "Знаю" on a right-drag) and, past
 * `SWIPE_COMMIT_THRESHOLD_PX`, commits that action on release. Mechanics:
 *
 *  - `touch-pan-y` on the draggable layer tells the browser to keep handling *vertical*
 *    touch scrolling itself and only ever hand *horizontal* drags to our pointer-move
 *    handler (acceptance: "свайп не конфликтует с вертикальным скроллом списка") — no
 *    `preventDefault()` tug-of-war needed, unlike the classic `touchmove`-only approach.
 *  - The live drag offset is applied via inline `style.transform` with no CSS transition
 *    class active — it must track the pointer 1:1, every frame, with zero lag. Only once the
 *    pointer is released does a `transition-transform` class turn on (gated
 *    `motion-safe:` / `motion-reduce:transition-none`, same idiom as
 *    `ExerciseFeedback.tsx`) to animate the snap back to 0 — reduced motion removes that
 *    animation but never the gesture itself (acceptance point 8): the drag tracking, the
 *    threshold check and the commit callback are all plain arithmetic, untouched by which
 *    branch of that CSS rule applies.
 *  - `didDragRef` distinguishes a genuine swipe from a tap: `<Link>` lives on the same
 *    draggable layer, so a drag that crossed `TAP_VS_DRAG_PX` suppresses the click event
 *    that would otherwise fire navigation once the pointer lifts.
 *  - Per-row gesture state (`useState`) is reset for free by `VirtualWordList` keying this
 *    component on `wordId` — `@tanstack/react-virtual` reuses the *wrapper* DOM node across
 *    different words as the list scrolls, but a changed `key` still unmounts/remounts this
 *    component itself, so a half-dragged offset never "sticks" to whatever word next occupies
 *    a recycled slot (acceptance point 7 — see `VirtualWordList.tsx` for the keying itself).
 *
 * The gesture is deliberately not the only way to trigger either action (NFR-11, task 16
 * §5): the two icon `<button>`s rendered below are always-visible, keyboard-focusable
 * `min-h-11 min-w-11` (44px) touch targets, siblings of the `<Link>` (not nested inside it —
 * nesting interactive controls inside an `<a>` is invalid HTML and confuses both keyboard
 * tab order and screen readers), so Tab reaches: lemma link -> "Не знаю" -> "Знаю" -> next
 * row's link.
 */
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { Check, X } from 'lucide-react'
import { Link } from 'react-router'
import { wordPath } from '@/app/word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { WordProgressRecord } from '@/types/progress.ts'
import { StatusBadge } from './StatusBadge.tsx'

/** Fixed row height in pixels — shared with `VirtualWordList`'s `estimateSize`. */
export const WORD_ROW_HEIGHT = 84

/** Horizontal drag distance (px) past which releasing the pointer commits the swipe. */
export const SWIPE_COMMIT_THRESHOLD_PX = 88

/** Horizontal drag distance (px) past which a pointer-up is treated as a swipe rather than a
 *  tap — suppresses the `<Link>`'s click/navigation for that release. Deliberately smaller
 *  than the commit threshold: an aborted (below-commit-threshold) swipe should still not
 *  accidentally navigate once it's moved this far. */
const TAP_VS_DRAG_PX = 10

/** Caps how far the foreground layer visually follows the pointer past the commit threshold
 *  — purely cosmetic (keeps the icon reveal from sliding fully off-screen), doesn't affect
 *  whether the gesture commits. */
const MAX_DRAG_PX = 132

const POS_LABEL: Readonly<Record<PosValue, string>> = {
  NOUN: 'Сущ.',
  VERB: 'Гл.',
  ADJ: 'Прил.',
  ADV: 'Нар.',
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function WordRow({
  entry,
  progress,
  showFormsBar,
  onMarkKnown,
  onMarkUnknown,
}: {
  entry: WordIndexEntry
  progress: WordProgressRecord | undefined
  /** Whether the "Формы" (morphology) progress bar should be filled for this row — driven
   *  by the page-level POS tab, not a per-row decision (see file header). */
  showFormsBar: boolean
  /** Swipe-right / "Знаю" button (task 16, FR-29). */
  onMarkKnown: (entry: WordIndexEntry) => void
  /** Swipe-left / "Не знаю" button (task 16, FR-29). */
  onMarkUnknown: (entry: WordIndexEntry) => void
}) {
  const wordId = encodeWordId(entry.lemma, entry.pos)
  const status = progress?.status ?? 'new'
  const morphPercent = Math.round((progress?.morphMaturity ?? 0) * 100)

  const [dragX, setDragX] = useState(0)
  const [settling, setSettling] = useState(false)
  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const didDragRef = useRef(false)
  const draggingHorizontallyRef = useRef(false)

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointerIdRef.current = e.pointerId
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    draggingHorizontallyRef.current = false
    setSettling(false)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return
    const dx = e.clientX - startXRef.current
    const dy = e.clientY - startYRef.current

    if (!draggingHorizontallyRef.current) {
      // Direction hasn't been decided yet — require a small, clearly-horizontal movement
      // before committing to "this is a swipe" (avoids hijacking a mostly-vertical scroll
      // that happens to wobble a few px sideways).
      if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return
      draggingHorizontallyRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    didDragRef.current = Math.abs(dx) > TAP_VS_DRAG_PX
    setDragX(clamp(dx, -MAX_DRAG_PX, MAX_DRAG_PX))
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return
    pointerIdRef.current = null

    const committedKnown = dragX >= SWIPE_COMMIT_THRESHOLD_PX
    const committedUnknown = dragX <= -SWIPE_COMMIT_THRESHOLD_PX

    setSettling(true)
    setDragX(0)
    draggingHorizontallyRef.current = false

    if (committedKnown) onMarkKnown(entry)
    else if (committedUnknown) onMarkUnknown(entry)
  }

  function handleClickCapture(e: MouseEvent) {
    if (didDragRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
    didDragRef.current = false
  }

  const revealingKnown = dragX > 0
  const revealingUnknown = dragX < 0
  const revealStrength = clamp(Math.abs(dragX) / SWIPE_COMMIT_THRESHOLD_PX, 0, 1)

  return (
    <div className="relative h-full w-full overflow-hidden border-b border-border">
      {/* Swipe reveal background — purely decorative, never intercepts pointer/keyboard. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between px-6"
        style={{
          background: revealingKnown
            ? `color-mix(in oklch, var(--color-success) ${Math.round(revealStrength * 60)}%, transparent)`
            : revealingUnknown
              ? `color-mix(in oklch, var(--color-error) ${Math.round(revealStrength * 60)}%, transparent)`
              : undefined,
        }}
      >
        <X
          className={`size-5 text-[var(--color-error)] ${revealingUnknown ? 'opacity-100' : 'opacity-0'}`}
        />
        <Check
          className={`size-5 text-[var(--color-success)] ${revealingKnown ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
        className={`relative flex h-full touch-pan-y items-center bg-background ${
          settling ? 'motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none' : ''
        }`}
        style={{ transform: `translateX(${dragX}px)` }}
      >
        <Link
          to={wordPath(wordId)}
          className="flex h-full min-w-0 flex-1 items-center gap-3 px-4 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate leading-tight font-medium text-foreground">{entry.lemma}</div>
            <div className="truncate text-sm leading-tight text-muted-foreground">
              {entry.primaryRu}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span>{POS_LABEL[entry.pos]}</span>
              <span aria-hidden="true">·</span>
              <span>{entry.level}</span>
              <span aria-hidden="true">·</span>
              <span>#{entry.rank}</span>
            </div>
            <div className="mt-1.5 h-1 max-w-40 overflow-hidden rounded-full bg-muted">
              {showFormsBar && (
                <div
                  role="progressbar"
                  aria-label={`Формы: ${morphPercent}%`}
                  aria-valuenow={morphPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${morphPercent}%` }}
                />
              )}
            </div>
          </div>
          <StatusBadge status={status} className="shrink-0" />
        </Link>

        {/* Non-gesture equivalents (NFR-11, task 16 §5) — siblings of the Link, not nested
         *  inside it, so they're independently reachable by Tab and don't trigger navigation. */}
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <button
            type="button"
            aria-label={`«${entry.lemma}»: не знаю`}
            title="Не знаю — начать изучение"
            onClick={() => onMarkUnknown(entry)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`«${entry.lemma}»: знаю`}
            title="Знаю"
            onClick={() => onMarkKnown(entry)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--color-success)]/10 hover:text-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Check aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
