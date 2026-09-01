/**
 * One labeled percentage bar — `WordDetailPage`'s "Слово" / "Формы" pair
 * (`spec/tasks/08-word-detail.md` §4, FR-46). Same visual language as
 * `features/words-list/components/WordRow.tsx`'s inline morphology bar (task 07), just
 * bigger and independently labeled instead of a bare unlabeled track — this screen shows the
 * two dimensions side by side, so each needs its own caption/percentage this time.
 */
import { cn } from '@/lib/utils'

export function MaturityBar({
  label,
  value,
  className,
}: {
  label: string
  /** 0..1 — clamped defensively, `WordProgressRecord`'s fields are already 0..1 by
   *  construction (architecture.md §5.4/§5.5) but a bar component shouldn't trust that. */
  value: number
  className?: string
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          role="progressbar"
          aria-label={`${label}: ${percent}%`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
