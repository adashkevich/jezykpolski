/**
 * `i / N` progress bar (`spec/tasks/13-session-runner.md` §3). `total` is the *live* queue
 * length, not a fixed `targetSize` snapshot — the mistake-requeue mechanic
 * (`stores/session.store.ts#appendToQueue`) can grow the queue mid-session, and the bar is
 * expected to reflect that honestly rather than overshoot 100% or freeze early.
 *
 * `trailing` sits on the counter row, right-aligned (`spec/design/task-*.png`: "2 / 20" on the
 * left, "Выйти" on the right, under a full-width bar).
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
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuenow={clampedCurrent}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Прогресс сессии"
        className="h-2 w-full overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="tnum text-label-lg text-muted-foreground">
          {clampedCurrent} / {total}
        </p>
        {trailing}
      </div>
    </div>
  )
}
