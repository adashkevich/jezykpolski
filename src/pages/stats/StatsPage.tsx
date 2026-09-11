/**
 * `/stats` — the statistics screen (`spec/tasks/23-stats.md`, `spec/app-design.md` §26,
 * requirements.md FR-120…FR-126; visual layout per `spec/design/progress.png`).
 *
 * Deliberately NOT gamified (FR-126, app-design §26 "Не надо начинать со сложной
 * геймификации"): no streaks, no badges, no levels-of-the-app-itself — just the numbers
 * `spec/tasks/23-stats.md` §1 lists, each backed by an index-only Dexie query or a
 * synchronous read of the in-memory content index (`stats.repository.ts`'s own header has
 * the full numerator/denominator breakdown per block).
 *
 * Every counter is `useLiveQuery`-based (`useWordProgressSummary`/`useReviewCounts`/
 * `useMorphologyProgress`), so the screen refreshes itself after a session completes, same
 * pattern as `HomePage.tsx` (task 15) — no manual refetch anywhere here.
 *
 * Two gated states:
 *  - Loading (`summary === undefined`, the first render before any live query has
 *    resolved): renders only the header, nothing else — avoids a flash of "0 known, 0
 *    learning" that would look identical to the real empty state below.
 *  - Fresh install (`learningTotal + learnedTotal === 0`, once loaded): the WHOLE screen
 *    becomes one `EmptyState` (acceptance point 8 — not just the morphology blocks, which
 *    have their own narrower gate below).
 *
 * "Падежи"/"Времена глаголов" are additionally gated on `morphology.hasNounData`/
 * `hasVerbData` (acceptance point 7) — a learner who has only ever done vocabulary
 * (`vocab:*` skills) has never materialized a single `noun`/`verb` `SkillRecord`, so
 * showing seven 0% case bars would misrepresent "not started" as "failing everything".
 */
import { useState, type ReactNode } from 'react'
import { History, Lock } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import type { LevelValue, PosValue } from '@/content/codec.ts'
import {
  levelProgress,
  posProgress,
  type BucketProgress,
} from '@/db/repositories/stats.repository.ts'
import { StatProgressBar } from '@/features/stats/components/StatProgressBar.tsx'
import { ConfusionCard } from '@/features/stats/components/ConfusionCard.tsx'
import { useConfusionMatrix } from '@/hooks/useConfusionMatrix.ts'
import { useLevelGate } from '@/hooks/useLevelGate.ts'
import { useMorphologyProgress } from '@/hooks/useMorphologyProgress.ts'
import { useReviewCounts } from '@/hooks/useReviewCounts.ts'
import { useWordProgressSummary } from '@/hooks/useWordProgressSummary.ts'
import {
  CASE_DISPLAY_ORDER,
  CASE_LABELS,
  TENSE_DISPLAY_ORDER,
  TENSE_LABELS,
} from '@/learning/skills/dimensions.ts'
import { cn } from '@/lib/utils'

const POS_LABELS: Readonly<Record<PosValue, { ru: string; pl: string }>> = {
  NOUN: { ru: 'Существительные', pl: 'Rzeczowniki' },
  VERB: { ru: 'Глаголы', pl: 'Czasowniki' },
  ADJ: { ru: 'Прилагательные', pl: 'Przymiotniki' },
  ADV: { ru: 'Наречия', pl: 'Przysłówki' },
}

function Headline({ label, value, unit, caption, accent = false }: {
  label: string
  value: number
  unit: string
  caption: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'text-label-md font-semibold tracking-[0.06em] uppercase',
          accent ? 'text-primary-strong' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'tnum text-display-lg',
            accent ? 'text-primary-strong' : 'text-foreground',
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            'text-body-md font-semibold',
            accent ? 'text-primary-strong' : 'text-muted-foreground',
          )}
        >
          {unit}
        </span>
      </p>
      <span className="text-body-sm text-muted-foreground">{caption}</span>
    </div>
  )
}

function ReviewTile({ label, value, caption, accent = false }: {
  label: string
  value: number
  caption: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-surface-low px-2 py-3 text-center">
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tnum text-headline-lg',
          accent ? 'text-primary-strong' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-label-sm text-muted-foreground">{caption}</span>
    </div>
  )
}

/** A "label · known / total · bar" row — the shared shape of "По частям речи"/"По уровням". */
function BucketRow({ label, sublabel, known, total, percent }: {
  label: string
  sublabel?: string
  known: number
  total: number
  percent: number
}) {
  const pct = Math.round(Math.min(1, Math.max(0, percent)) * 100)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-headline-sm text-foreground">{label}</span>
          {sublabel && (
            <span className="text-label-md font-semibold text-muted-foreground">{sublabel}</span>
          )}
        </div>
        <span className="tnum shrink-0 text-label-lg text-foreground">
          {known.toLocaleString('ru-RU')} / {total.toLocaleString('ru-RU')}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div
          role="progressbar"
          aria-label={`${label}: ${pct}%`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-full rounded-full bg-primary-strong transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SectionCard({ title, aside, children }: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-headline-md">{title}</CardTitle>
        {aside && <span className="text-body-sm text-muted-foreground">{aside}</span>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

/** "B1 – C2" for a contiguous run of still-locked levels, or a single "B1". Task 38's gate is
 *  strictly sequential, so the locked set is always a suffix of `LEVEL_VALUES`. */
function levelRange(rows: readonly BucketProgress<LevelValue>[]): string {
  const first = rows[0]!.key
  const last = rows[rows.length - 1]!.key
  return first === last ? first : `${first} – ${last}`
}

export function StatsPage() {
  // Captured once on mount, not read fresh in the render body — same reasoning as
  // `HomePage.tsx`'s `today`/`useDueCount.ts`'s `mountedAt` (`react-hooks/purity`).
  const [now] = useState(() => Date.now())

  const summary = useWordProgressSummary()
  const reviewCounts = useReviewCounts(now)
  const morphology = useMorphologyProgress()
  const confusionMatrix = useConfusionMatrix()
  const levelGate = useLevelGate()

  const loading = summary === undefined
  const hasAnyProgress = (summary?.learningTotal ?? 0) + (summary?.learnedTotal ?? 0) > 0

  // Task 35 (`spec/tasks/35-level-gated-new-words.md` §4): levels the daily session's
  // new-word gate hasn't opened yet are collapsed into one "откроются позже" row. No new
  // query/bucket — `useLevelGate` reuses `computeLevelPoolCounts`/`unlockedLevels` from the
  // same `wordProgress` read `useWordProgressSummary` already triggers. `levelGate ===
  // undefined` (still loading) shows every level as open rather than flashing all of them
  // as locked for one frame.
  const levels = summary ? levelProgress(summary) : []
  const openLevels = levels.filter((row) => !levelGate || levelGate.unlocked.includes(row.key))
  const lockedLevels = levels.filter((row) => levelGate && !levelGate.unlocked.includes(row.key))

  return (
    <PageContainer>
      <PageHeader title="Прогресс" description="Что проседает — без стриков и бейджей" visuallyHidden />

      {!loading && !hasAnyProgress && (
        <EmptyState
          title="Пока нет данных"
          description="Начните учить слова на главной — статистика появится после первых ответов."
        />
      )}

      {!loading && hasAnyProgress && summary && (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-4">
              <Headline
                label="Известно слов"
                value={summary.learnedTotal}
                unit="слов"
                caption="Освоено прочно"
              />
              <div className="border-l border-border pl-4">
                <Headline
                  label="Изучается"
                  value={summary.learningTotal}
                  unit="в цикле"
                  caption="В активном повторении"
                  accent
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary-strong"
              >
                <History className="size-5" />
              </span>
              <CardTitle className="text-headline-md">Повторения</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              <ReviewTile label="Сегодня" value={reviewCounts?.today ?? 0} caption="карточки" accent />
              <ReviewTile label="Завтра" value={reviewCounts?.tomorrow ?? 0} caption="запланировано" />
              <ReviewTile label="7 дней" value={reviewCounts?.in7Days ?? 0} caption="в очереди" />
            </CardContent>
          </Card>

          <SectionCard title="По частям речи" aside="Категории">
            {posProgress(summary).map((row) => (
              <BucketRow
                key={row.key}
                label={POS_LABELS[row.key].ru}
                sublabel={POS_LABELS[row.key].pl}
                known={row.known}
                total={row.total}
                percent={row.percent}
              />
            ))}
          </SectionCard>

          <SectionCard title="По уровням" aside="CEFR">
            {openLevels.map((row) => (
              <BucketRow
                key={row.key}
                label={row.key}
                known={row.known}
                total={row.total}
                percent={row.percent}
              />
            ))}
            {lockedLevels.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-4 py-3">
                <span className="text-headline-sm text-muted-foreground">
                  {levelRange(lockedLevels)}
                </span>
                <span className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                  <Lock aria-hidden="true" className="size-4" />
                  {lockedLevels.length === 1 ? 'Откроется позже' : 'Откроются позже'}
                </span>
              </div>
            )}
          </SectionCard>

          {confusionMatrix && confusionMatrix.length > 0 && (
            <ConfusionCard pair={confusionMatrix[0]!} />
          )}

          {morphology?.hasNounData && (
            <SectionCard title="Падежи">
              {CASE_DISPLAY_ORDER.map((caseValue) => (
                <StatProgressBar
                  key={caseValue}
                  label={CASE_LABELS[caseValue].pl}
                  value={morphology.caseProgress.get(caseValue) ?? 0}
                />
              ))}
            </SectionCard>
          )}

          {morphology?.hasVerbData && (
            <SectionCard title="Времена глаголов">
              {TENSE_DISPLAY_ORDER.map((tense) => (
                <StatProgressBar
                  key={tense}
                  label={TENSE_LABELS[tense].ru}
                  value={morphology.tenseProgress.get(tense) ?? 0}
                />
              ))}
            </SectionCard>
          )}
        </>
      )}
    </PageContainer>
  )
}

export default StatsPage
