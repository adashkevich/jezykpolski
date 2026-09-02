/**
 * `/` — home screen (`spec/tasks/15-home-screen.md`, requirements.md FR-10…FR-14).
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
 *  - "Повторить N" — `useDueCount()` (task 05/11), already an index-only `countDue` query
 *    (`skills.repository.ts`, the `due` index).
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
 * Empty states (task text §4):
 *  - No progress at all yet (`learningTotal + learnedTotal === 0` — a fresh install, since a
 *    `wordProgress` row for a word is only ever written after that word's first graded
 *    answer, `answer-pipeline.ts`) → CTA reads "Начать обучение" plus a one-line onboarding
 *    blurb, and the "Повторить N" counter is not shown at all (there is nothing to review).
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
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import type { PosValue } from '@/content/codec.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { useDailyStats } from '@/hooks/useDailyStats.ts'
import { useDueCount } from '@/hooks/useDueCount.ts'
import { useWordProgressSummary } from '@/hooks/useWordProgressSummary.ts'
import { toLocalDateKey } from '@/lib/dates.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'

/** Russian plural-form picker (`count % 10` / `% 100` rule) — same shape as
 *  `ResumeSessionPrompt.tsx#pluralizeItem`, generalized to 3 forms so this page can inflect
 *  several different words/predicates instead of hardcoding one. */
function pluralize(count: number, forms: readonly [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

const POS_SECTIONS: ReadonlyArray<{ pos: PosValue; label: string }> = [
  { pos: 'NOUN', label: 'Существительные' },
  { pos: 'VERB', label: 'Глаголы' },
  { pos: 'ADJ', label: 'Прилагательные' },
]

export function HomePage() {
  const navigate = useNavigate()
  // Captured once on mount (not read fresh in the render body — `react-hooks/purity`, same
  // reasoning as `useDueCount.ts`'s `mountedAt`): "today" staying fixed for this page's
  // lifetime is fine, a daily-stats block a few minutes stale across local midnight is not
  // a real-world concern for a study app.
  const [today] = useState(() => toLocalDateKey(Date.now()))

  const dueCount = useDueCount()
  const summary = useWordProgressSummary()
  const dailyStats = useDailyStats(today)

  const loading = dueCount === undefined || summary === undefined

  const learningTotal = summary?.learningTotal ?? 0
  const learnedTotal = summary?.learnedTotal ?? 0
  const hasAnyProgress = learningTotal + learnedTotal > 0
  const due = dueCount ?? 0

  const reviewsCount = dailyStats?.reviewsCount ?? 0
  const correctCount = dailyStats?.correctCount ?? 0
  const newSkillsStarted = dailyStats?.newSkillsStarted ?? 0
  const percentCorrect = reviewsCount > 0 ? Math.round((correctCount / reviewsCount) * 100) : null

  function openWords(pos?: PosValue) {
    useFiltersStore.getState().setPos(pos ?? null)
    navigate('/words')
  }

  let ctaLabel: string
  let reviewDescription: string | null
  if (loading) {
    ctaLabel = 'Продолжить обучение'
    reviewDescription = null
  } else if (!hasAnyProgress) {
    ctaLabel = 'Начать обучение'
    reviewDescription =
      'Добро пожаловать! Мы сами подберём первые слова и будем повторять их по расписанию.'
  } else if (due === 0) {
    ctaLabel = 'Учить новые слова'
    reviewDescription = 'Повторений на сегодня нет — можно выучить что-то новое.'
  } else {
    ctaLabel = 'Продолжить обучение'
    reviewDescription = `${due} ${pluralize(due, ['слово', 'слова', 'слов'])} ${pluralize(due, ['готово', 'готовы', 'готовы'])} к повторению`
  }

  return (
    <PageContainer>
      <PageHeader title="Главная" description="Dzisiaj — что делать сейчас" />

      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Повторить
          </p>
          {reviewDescription && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {reviewDescription}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="min-h-11 w-full text-base"
            disabled={loading}
            onClick={() => navigate('/session')}
          >
            {ctaLabel}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Слова</p>
              <p className="text-sm text-muted-foreground">
                {learningTotal} изучается · {learnedTotal} выучено
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
              onClick={() => openWords()}
            >
              Открыть
            </Button>
          </div>

          <div className="mt-2 divide-y divide-border">
            {POS_SECTIONS.map(({ pos, label }) => {
              const total = getIndexStore().byPos.get(pos)?.length ?? 0
              const learned = summary?.learnedByPos[pos] ?? 0
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => openWords(pos)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="text-foreground">{label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {learned} / {total}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="font-medium text-foreground">Сегодня</p>
          <p className="text-sm text-muted-foreground">
            {reviewsCount} {pluralize(reviewsCount, ['повторение', 'повторения', 'повторений'])} ·{' '}
            {newSkillsStarted} {newSkillsStarted === 1 ? 'новое' : 'новых'}{' '}
            {pluralize(newSkillsStarted, ['слово', 'слова', 'слов'])}
            {percentCorrect !== null ? ` · ${percentCorrect}% правильных` : ''}
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  )
}

export default HomePage
