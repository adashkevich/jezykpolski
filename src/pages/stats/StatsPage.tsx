/**
 * `/stats` — the statistics screen (`spec/tasks/23-stats.md`, `spec/app-design.md` §26,
 * requirements.md FR-120…FR-126).
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
import { useState } from 'react'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { levelProgress, posProgress } from '@/db/repositories/stats.repository.ts'
import { StatProgressBar } from '@/features/stats/components/StatProgressBar.tsx'
import { useMorphologyProgress } from '@/hooks/useMorphologyProgress.ts'
import { useReviewCounts } from '@/hooks/useReviewCounts.ts'
import { useWordProgressSummary } from '@/hooks/useWordProgressSummary.ts'
import {
  CASE_DISPLAY_ORDER,
  CASE_LABELS,
  TENSE_DISPLAY_ORDER,
  TENSE_LABELS,
} from '@/learning/skills/dimensions.ts'

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-3xl font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

export function StatsPage() {
  // Captured once on mount, not read fresh in the render body — same reasoning as
  // `HomePage.tsx`'s `today`/`useDueCount.ts`'s `mountedAt` (`react-hooks/purity`).
  const [now] = useState(() => Date.now())

  const summary = useWordProgressSummary()
  const reviewCounts = useReviewCounts(now)
  const morphology = useMorphologyProgress()

  const loading = summary === undefined
  const hasAnyProgress = (summary?.learningTotal ?? 0) + (summary?.learnedTotal ?? 0) > 0

  return (
    <PageContainer>
      <PageHeader title="Прогресс" description="Что проседает — без стриков и бейджей" />

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
              <BigStat label="Известно слов" value={summary.learnedTotal} />
              <BigStat label="Изучается" value={summary.learningTotal} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>По уровням</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {levelProgress(summary).map((row) => (
                <StatProgressBar key={row.key} label={row.key} value={row.percent} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Части речи</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {posProgress(summary).map((row) => (
                <StatProgressBar key={row.key} label={row.key} value={row.percent} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Повторения</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              <SmallStat label="Сегодня" value={reviewCounts?.today ?? 0} />
              <SmallStat label="Завтра" value={reviewCounts?.tomorrow ?? 0} />
              <SmallStat label="7 дней" value={reviewCounts?.in7Days ?? 0} />
            </CardContent>
          </Card>

          {morphology?.hasNounData && (
            <Card>
              <CardHeader>
                <CardTitle>Падежи</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {CASE_DISPLAY_ORDER.map((caseValue) => (
                  <StatProgressBar
                    key={caseValue}
                    label={CASE_LABELS[caseValue].pl}
                    value={morphology.caseProgress.get(caseValue) ?? 0}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {morphology?.hasVerbData && (
            <Card>
              <CardHeader>
                <CardTitle>Времена глаголов</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {TENSE_DISPLAY_ORDER.map((tense) => (
                  <StatProgressBar
                    key={tense}
                    label={TENSE_LABELS[tense].ru}
                    value={morphology.tenseProgress.get(tense) ?? 0}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageContainer>
  )
}

export default StatsPage
