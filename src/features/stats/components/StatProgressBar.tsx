/**
 * One labeled percentage bar for the `/stats` screen — "По уровням"/"Части речи"/"Падежи"/
 * "Времена глаголов" rows (`spec/tasks/23-stats.md` §1/§4: "Простые полосы прогресса на
 * CSS. Не подключать библиотеку графиков", acceptance point 9).
 *
 * Deliberately a fresh, small component rather than importing
 * `features/word-detail/components/MaturityBar.tsx` — same visual language (a labeled
 * `h-2 rounded-full` track, `bg-primary` fill), but `features/**` folders are per-screen in
 * this app (architecture.md §3 lists `features/stats/{components}` as its own leaf,
 * separate from `features/word-detail/{components}`), so this screen owns its own copy
 * rather than reaching into a sibling feature for a ~15-line presentational component.
 */
import { cn } from '@/lib/utils'

export function StatProgressBar({
  label,
  value,
  className,
  muted = false,
}: {
  label: string
  /** 0..1 — clamped defensively, same posture as `MaturityBar`. */
  value: number
  className?: string
  /** Task 35 (`spec/tasks/35-level-gated-new-words.md` §4) — a level the new-word gate
   *  hasn't opened yet ("откроется позже"). Deliberately NOT plain `opacity-*` on the whole
   *  row: that dims the label/percent text along with everything else and fails axe's
   *  `color-contrast` rule (opacity halves effective contrast against the page background).
   *  Only the label swaps to the already-accessible `text-muted-foreground` token (same one
   *  the percent span already uses everywhere else on this screen) and the bar fill dims —
   *  a non-text element `color-contrast` doesn't check. */
  muted?: boolean
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between text-sm">
        <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
        <span className="tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          role="progressbar"
          aria-label={`${label}: ${percent}%`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn(
            'h-full rounded-full transition-[width]',
            muted ? 'bg-muted-foreground/40' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
