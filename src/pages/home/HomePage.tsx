/**
 * `/` — home screen (`spec/tasks/15-home-screen.md`, requirements.md FR-10…FR-14; visual
 * layout per `spec/design/main.png`).
 *
 * Answers "what should I do right now" (FR-14): exactly one prominent CTA, everything else
 * a secondary link. The CTA always routes to `/session` with no router state —
 * `useSessionBootstrap` (task 13) already builds the global Learn queue (due reviews first,
 * then new words) and renders its own empty/resume states, so this page never shows a setup
 * screen (FR-11, acceptance point 2). Only the button's *label* changes with context (fresh
 * install / nothing due right now / normal); the destination never does, which is what keeps
 * this "one CTA" rather than three different buttons for three states.
 *
 * Counters, all `useLiveQuery`-based so they refresh themselves after a session completes,
 * with no manual refetch anywhere on this page (acceptance point 4):
 *  - "N слов готовы к повторению" — `useDueCount()` (task 05/11), already an index-only
 *    `countDue` query (`skills.repository.ts`, the `due` index).
 *  - "изучается / выучено", overall and per part of speech — `useWordProgressSummary()`
 *    (`src/hooks/useWordProgressSummary.ts`, new in this task). Its repository function
 *    reads `wordProgress` ONLY through the `status` index
 *    (`.where('status').equals(...).primaryKeys()`, never `.toArray()` over the full
 *    ~8000-row table — acceptance point 8) and buckets the matches by POS from the
 *    already-decoded `wordId` (`decodeWordId`). The *denominator* — how many words a
 *    section has in total — comes from `getIndexStore().byPos`, the in-memory content index
 *    built once at startup (task 04): a synchronous `Map` read, not a second Dexie query.
 *  - "Сегодня" — `useDailyStats()` for today's local-calendar-day `DailyStatsRecord`.
 *
 * Deliberately no streak counter or weekly delta even though the mockup sketches them:
 * `StatsPage.tsx`'s FR-126 "no gamification" rule applies here too, and there is no data
 * behind a "+12 за неделю" line anyway.
 *
 * Empty states (task text §4):
 *  - No progress at all yet (`learningTotal + learnedTotal === 0` — a fresh install, since a
 *    `wordProgress` row for a word is only ever written after that word's first graded
 *    answer, `answer-pipeline.ts`) → CTA reads "Начать обучение" plus a one-line onboarding
 *    blurb, and the due counter is not shown at all (there is nothing to review).
 *  - `countDue() === 0` but the learner has existing progress → CTA reads "Учить новые
 *    слова" instead of "Продолжить обучение", and the block explicitly says "нет
 *    повторений" rather than "0 слов готовы к повторению" (acceptance point 7 — a bare zero
 *    reads as broken, not as "you're caught up").
 *
 * Navigation for "Открыть"/a POS row: sets `useFiltersStore`'s `pos` filter and pushes
 * `/words` — reusing the store's own setter (`filters.store.ts`, task 07) rather than a new
 * mechanism, so `/words` opens already scoped to that part of speech instead of landing on
 * the still-stub `/nouns`/`/verbs`/`/adjectives` pages (architecture.md §9 documents those
 * as reachable via a POS switcher *inside* "Слова", not as independent list screens yet).
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Flame,
  RefreshCw,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Button } from '@/components/ui/button.tsx'
import type { PosValue } from '@/content/codec.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { LearnHero } from '@/features/learn/components/LearnHero.tsx'
import { useDailyStats } from '@/hooks/useDailyStats.ts'
import { useWordProgressSummary } from '@/hooks/useWordProgressSummary.ts'
import { toLocalDateKey } from '@/lib/dates.ts'
import { pluralize } from '@/lib/pluralize.ts'
import { cn } from '@/lib/utils'
import { useFiltersStore } from '@/stores/filters.store.ts'

const POS_SECTIONS: ReadonlyArray<{ pos: PosValue; label: string; pl: string; bar: string }> = [
  { pos: 'NOUN', label: 'Существительные', pl: 'Rzeczowniki', bar: 'bg-primary' },
  { pos: 'VERB', label: 'Глаголы', pl: 'Czasowniki', bar: 'bg-state-learning' },
  { pos: 'ADJ', label: 'Прилагательные', pl: 'Przymiotniki', bar: 'bg-muted-foreground' },
  { pos: 'ADV', label: 'Наречия', pl: 'Przysłówki', bar: 'bg-muted-foreground' },
]

function ratio(part: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0
}

function Bar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-track">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${percent}%` }} />
    </div>
  )
}

function StatTile({
  label,
  icon: Icon,
  iconClassName,
  value,
  unit,
  footer,
}: {
  label: string
  icon: LucideIcon
  iconClassName: string
  value: ReactNode
  unit?: string
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-36 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-sm font-medium text-muted-foreground">{label}</span>
        <span
          aria-hidden="true"
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', iconClassName)}
        >
          <Icon className="size-[1.125rem]" />
        </span>
      </div>
      <p className="flex items-baseline gap-1.5">
        <span className="tnum text-headline-lg text-foreground">{value}</span>
        {unit && <span className="text-label-md font-semibold text-muted-foreground">{unit}</span>}
      </p>
      {footer && <div className="mt-auto">{footer}</div>}
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  // Captured once on mount (not read fresh in the render body — `react-hooks/purity`, same
  // reasoning as `useDueCount.ts`'s `mountedAt`): "today" staying fixed for this page's
  // lifetime is fine, a daily-stats block a few minutes stale across local midnight is not
  // a real-world concern for a study app.
  const [today] = useState(() => toLocalDateKey(Date.now()))

  const summary = useWordProgressSummary()
  const dailyStats = useDailyStats(today)

  const learningTotal = summary?.learningTotal ?? 0
  const learnedTotal = summary?.learnedTotal ?? 0
  const totalWords = getIndexStore().byId.size

  const reviewsCount = dailyStats?.reviewsCount ?? 0
  const correctCount = dailyStats?.correctCount ?? 0
  const newSkillsStarted = dailyStats?.newSkillsStarted ?? 0
  const percentCorrect = reviewsCount > 0 ? Math.round((correctCount / reviewsCount) * 100) : null

  function openWords(pos?: PosValue) {
    useFiltersStore.getState().setPos(pos ?? null)
    navigate('/words')
  }

  return (
    <PageContainer>
      <PageHeader title="Главная" description="Dzisiaj — что делать сейчас" visuallyHidden />

      {/* Hero: the one primary action on the screen (shared with `/practice`). */}
      <LearnHero />

      {/* Today's activity. The title and its counters are siblings in one wrapper — e2e
          (`critical-learning-flow.spec.ts`) scopes its counter check to "Сегодня"'s parent. */}
      <section className="flex items-center gap-4 rounded-2xl bg-surface-low px-4 py-4">
        <CalendarDays aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-label-lg text-foreground">Сегодня</p>
          <p className="text-body-sm text-muted-foreground">
            {reviewsCount} {pluralize(reviewsCount, ['повторение', 'повторения', 'повторений'])} ·{' '}
            {newSkillsStarted} {newSkillsStarted === 1 ? 'новое' : 'новых'}{' '}
            {pluralize(newSkillsStarted, ['слово', 'слова', 'слов'])}
            {percentCorrect !== null ? ` · ${percentCorrect}% правильных` : ''}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-headline-md text-foreground">Текущий прогресс</h2>
            <p className="text-body-sm text-muted-foreground">
              {learningTotal} изучается · {learnedTotal} выучено
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2 min-h-11 shrink-0 text-muted-foreground"
            onClick={() => openWords()}
          >
            Открыть
            <ChevronRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Изучено слов"
            icon={BadgeCheck}
            iconClassName="bg-info-soft text-info"
            value={learnedTotal.toLocaleString('ru-RU')}
            unit={`/ ${totalWords.toLocaleString('ru-RU')}`}
            footer={<Bar percent={ratio(learnedTotal, totalWords)} className="bg-primary" />}
          />
          <StatTile
            label="В процессе"
            icon={RefreshCw}
            iconClassName="bg-info-soft text-info"
            value={learningTotal.toLocaleString('ru-RU')}
            unit={pluralize(learningTotal, ['слово', 'слова', 'слов'])}
            footer={<p className="text-label-md font-semibold text-info">в активном повторении</p>}
          />
          <StatTile
            label="Точность"
            icon={Target}
            iconClassName="bg-info-soft text-info"
            value={percentCorrect !== null ? `${percentCorrect}%` : '—'}
            unit={percentCorrect !== null ? 'правильных' : undefined}
            footer={<p className="text-label-md font-semibold text-muted-foreground">за сегодня</p>}
          />
          <StatTile
            label="Повторений"
            icon={Flame}
            iconClassName="bg-primary-soft text-primary-strong"
            value={reviewsCount}
            unit="сегодня"
            footer={
              <p className="text-label-md font-semibold text-primary-strong">
                {newSkillsStarted} {newSkillsStarted === 1 ? 'новое' : 'новых'}
              </p>
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-headline-md text-foreground">По частям речи</h2>
        <ul className="flex flex-col gap-2.5">
          {POS_SECTIONS.map(({ pos, label, pl, bar }) => {
            const total = getIndexStore().byPos.get(pos)?.length ?? 0
            const learned = summary?.learnedByPos[pos] ?? 0
            return (
              <li key={pos}>
                <button
                  type="button"
                  onClick={() => openWords(pos)}
                  className="flex min-h-18 w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-card transition-colors hover:bg-surface-low focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-headline-sm break-words text-foreground">{label}</span>
                    <span className="text-label-md font-semibold text-muted-foreground">{pl}</span>
                  </span>
                  <span className="flex w-24 shrink-0 flex-col items-end gap-2">
                    <span className="tnum text-label-lg text-foreground">
                      {learned.toLocaleString('ru-RU')} / {total.toLocaleString('ru-RU')}
                    </span>
                    <Bar percent={ratio(learned, total)} className={bar} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </PageContainer>
  )
}

export default HomePage
