/**
 * `i / N` progress bar (`spec/tasks/13-session-runner.md` §3). `total` is the *live* queue
 * length, not a fixed `targetSize` snapshot — the mistake-requeue mechanic
 * (`stores/session.store.ts#appendToQueue`) can grow the queue mid-session, and the bar is
 * expected to reflect that honestly rather than overshoot 100% or freeze early.
 *
 * `trailing` sits inline with the counter and the bar itself, right-aligned — folded onto one
 * row (was a separate row underneath the bar) so the fixed header takes less vertical space,
 * which matters most on the letter-input screen where an iOS/Android soft keyboard eats a big
 * chunk of the viewport (`LetterSlotsInput.tsx`).
 */
import type { ReactNode } from 'react'

export function SessionProgressBar({
  current,
  total,
  trailing,
}: {
  current: number
  total: number
  trailing?: ReactNode
}) {
  const clampedCurrent = Math.min(current, total)
  const percent = total > 0 ? Math.round((clampedCurrent / total) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <p className="tnum shrink-0 text-label-lg text-muted-foreground">
        {clampedCurrent} / {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={clampedCurrent}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Прогресс сессии"
        className="h-2 w-full min-w-0 flex-1 overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      {trailing}
    </div>
  )
}
