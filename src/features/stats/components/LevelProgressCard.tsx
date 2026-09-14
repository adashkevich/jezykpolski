/**
 * "По уровням" card — shared by `/stats` (`StatsPage.tsx`) and `/` (`HomePage.tsx`, which
 * shows the same level breakdown in place of the old "По частям речи" list). Single source
 * of truth for the block so the two screens can never disagree about layout or numbers, same
 * reasoning as `stats.repository.ts`'s numerator/denominator split.
 *
 * Each row shows "учу / знаю / всего" (`LevelBucketProgress.learning/known/total`) plus a
 * two-segment bar — a red (`--primary-strong`) "знаю" segment and a blue
 * (`--state-learning`) "учу" segment — replacing the old single-status bar and its static
 * "CEFR" label with a color legend for the two segments.
 *
 * `onSelectLevel`, when given, turns every open-level row into a button (Home's "tap a
 * section to open it filtered" pattern, same as the old POS rows) — the bar is then
 * `aria-hidden` (decorative) since the row's own visible text already carries the numbers,
 * mirroring how the old POS row's `Bar` was `aria-hidden` inside its own button. Without it
 * (`/stats`), rows are static and the bar keeps its `role="progressbar"` for screen readers.
 */
import { Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import type { LevelValue } from '@/content/codec.ts'
import { levelProgress, type LevelBucketProgress } from '@/db/repositories/stats.repository.ts'
import type { WordProgressSummary } from '@/db/repositories/words-progress.repository.ts'
import type { LevelGateState } from '@/hooks/useLevelGate.ts'
import { cn } from '@/lib/utils'

function Legend() {
  return (
    <span className="flex items-center gap-3 text-body-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-state-learning" />
        учу
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-primary-strong" />
        знаю
      </span>
    </span>
  )
}

function LevelBar({
  knownPercent,
  learningPercent,
  label,
  decorative,
}: {
  knownPercent: number
  learningPercent: number
  label: string
  decorative: boolean
}) {
  const knownPct = Math.round(Math.min(1, Math.max(0, knownPercent)) * 100)
  const learningPct = Math.round(Math.min(1, Math.max(0, learningPercent)) * 100)
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-track"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'progressbar'}
      aria-label={decorative ? undefined : `${label}: ${knownPct}% знаю, ${learningPct}% учу`}
      aria-valuenow={decorative ? undefined : Math.min(100, knownPct + learningPct)}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : 100}
    >
      <div className="h-full shrink-0 rounded-l-full bg-primary-strong" style={{ width: `${knownPct}%` }} />
      <div className="h-full shrink-0 bg-state-learning" style={{ width: `${learningPct}%` }} />
    </div>
  )
}

function LevelRow({ row, onSelect }: { row: LevelBucketProgress; onSelect?: () => void }) {
  const content = (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <span className="text-headline-sm text-foreground">{row.key}</span>
        <span className="tnum shrink-0 text-label-lg">
          <span className="text-state-learning">{row.learning.toLocaleString('ru-RU')}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-primary-strong">{row.known.toLocaleString('ru-RU')}</span>
          <span className="text-muted-foreground"> / {row.total.toLocaleString('ru-RU')}</span>
        </span>
      </div>
      <LevelBar
        knownPercent={row.percent}
        learningPercent={row.learningPercent}
        label={row.key}
        decorative={!!onSelect}
      />
    </div>
  )

  if (!onSelect) return content
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
      )}
    >
      {content}
    </button>
  )
}

/** "B1 – C2" for a contiguous run of still-locked levels, or a single "B1". Task 38's gate is
 *  strictly sequential, so the locked set is always a suffix of `LEVEL_VALUES`. */
function levelRange(rows: readonly LevelBucketProgress[]): string {
  const first = rows[0]!.key
  const last = rows[rows.length - 1]!.key
  return first === last ? first : `${first} – ${last}`
}

export function LevelProgressCard({
  summary,
  levelGate,
  onSelectLevel,
}: {
  summary: WordProgressSummary
  levelGate: LevelGateState | undefined
  /** When given, open-level rows become buttons that call this on click (Home's "open
   *  filtered" pattern). Omit for a static, non-interactive card (`/stats`). */
  onSelectLevel?: (level: LevelValue) => void
}) {
  // Task 35 (`spec/tasks/35-level-gated-new-words.md` §4): levels the daily session's
  // new-word gate hasn't opened yet are collapsed into one "откроются позже" row.
  // `levelGate === undefined` (still loading) shows every level as open rather than flashing
  // all of them as locked for one frame.
  const levels = levelProgress(summary)
  const openLevels = levels.filter((row) => !levelGate || levelGate.unlocked.includes(row.key))
  const lockedLevels = levels.filter((row) => levelGate && !levelGate.unlocked.includes(row.key))

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-headline-md">По уровням</CardTitle>
        <Legend />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {openLevels.map((row) => (
          <LevelRow
            key={row.key}
            row={row}
            onSelect={onSelectLevel ? () => onSelectLevel(row.key) : undefined}
          />
        ))}
        {lockedLevels.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-4 py-3">
            <span className="text-headline-sm text-muted-foreground">{levelRange(lockedLevels)}</span>
            <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
              <Lock aria-hidden="true" className="size-4" />
              {lockedLevels.length === 1 ? 'Откроется позже' : 'Откроются позже'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
