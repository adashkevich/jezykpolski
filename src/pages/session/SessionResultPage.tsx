/**
 * `/session/result` — real implementation (`spec/tasks/14-session-results.md` §1,
 * `spec/app-design.md` §21 "Экран результатов сессии" / §22 "Режим «Ошибки»", replacing the
 * task-06 stub.
 *
 * All data comes from `useSessionResult` (`../../features/session-results/hooks
 * /useSessionResult.ts`): the finished session's `SessionRecord` + `reviewLogs`, reduced to
 * a `SessionSummaryView` by the pure `buildSessionSummary`. This page owns only the mapping
 * from that summary to markup, plus the two buttons' navigation.
 *
 * "Разобрать ошибки" (FR-102, app-design.md §22): navigates to `/session` with
 * `{ skillIds: mistakeSkillIds(summary) }` as router state — `parseSessionScope`
 * (`features/session-runner/lib/session-scope.ts`) recognizes that shape as the `'mistake'`
 * scope, and `useSessionBootstrap.ts#startFresh` maps that scope to `mode: 'mistakes'`. Only
 * rendered when there's at least one mistake to review.
 *
 * Task 36 (`spec/tasks/36-practice-screen-restructure.md` §4, FR-149) — when this session came
 * from a `{ kind: 'practice-extra' }` scope (`SessionPage.tsx#goToResults` forwards
 * `{ variant, filter }` as `state.practiceExtra`), "Закончить" is replaced by
 * `PracticeDrillActions`'s "Ещё"/"К списку практик": these two drills ("Выбор перевода",
 * "Написание по-польски") are meant to be repeated in a sitting, unlike ordinary Learn/forms
 * sessions. "Разобрать ошибки" still renders above it when there are mistakes — reviewing what
 * was just missed is orthogonal to "run another batch".
 */
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useState } from 'react'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { DiffText } from '@/components/app/AnswerDiff.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { diffAnswer } from '@/learning/exercises/answer-diff.ts'
import type { DimensionLabel } from '@/learning/skills/dimensions.ts'
import {
  mistakeSkillIds,
  type HardestDimensionEntry,
  type MistakeEntry,
} from '@/features/session-results/lib/build-session-summary.ts'
import { useSessionResult } from '@/features/session-results/hooks/useSessionResult.ts'
import {
  resolveLexicalCandidateWordIds,
  type LexicalWordFilter,
  type PracticeExtraVariant,
} from '@/features/session-runner/lib/session-scope.ts'
import { VOCAB_DRILL_BATCH_SIZE, sampleWordBatch } from '@/learning/practice/lexical-batch.ts'
import { PracticeDrillActions } from '@/features/session-runner/components/PracticeDrillActions.tsx'

function bilingual(label: DimensionLabel): string {
  return `${label.pl} (${label.ru})`
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-muted/50 py-3">
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function HardestDimensionRow({ entry }: { entry: HardestDimensionEntry }) {
  const percent = Math.round(entry.accuracy * 100)
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-foreground">{bilingual(entry.label)}</span>
      <span className="font-medium tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  )
}

function MistakeRow({ entry }: { entry: MistakeEntry }) {
  // Task 28 (FR-58): у набранного ответа обе стороны показываются побуквенно — те же
  // зелёные/красные буквы, что и в самой сессии, чтобы разбор ошибок не выглядел иначе, чем
  // фидбек, который пользователь уже видел. Выбранный из списка ответ остаётся сплошной
  // строкой: сравнивать по буквам два разных слова бессмысленно.
  const diff = entry.typedAnswer ? diffAnswer(entry.answerGiven, entry.expected) : null

  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <p className="text-sm text-foreground">
        <span className="font-medium">{entry.lemma}</span>
        <span className="text-muted-foreground"> · {bilingual(entry.dimensionLabel)}</span>
      </p>
      <p className="font-mono text-sm">
        {diff && entry.answerGiven ? (
          <DiffText chars={diff.typed} />
        ) : (
          <span className="text-error">{entry.answerGiven || '—'}</span>
        )}
        <span className="mx-2 text-muted-foreground">→</span>
        {diff ? (
          <DiffText chars={diff.expected} />
        ) : (
          <span className="text-success">{entry.expected}</span>
        )}
      </p>
    </li>
  )
}

interface PracticeExtraOrigin {
  readonly variant: PracticeExtraVariant
  readonly filter: LexicalWordFilter
}

export function SessionResultPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as
    | { sessionId?: number; practiceExtra?: PracticeExtraOrigin }
    | null
  const status = useSessionResult(state?.sessionId)
  const [resampling, setResampling] = useState(false)

  if (status.phase === 'redirect-home') {
    return <Navigate to="/" replace />
  }

  if (status.phase === 'loading') {
    return (
      <PageContainer>
        <PageHeader title="Результаты сессии" />
        <p
          role="status"
          aria-live="polite"
          className="py-8 text-center text-sm text-muted-foreground"
        >
          Считаем итоги…
        </p>
      </PageContainer>
    )
  }

  if (status.phase === 'error') {
    return (
      <PageContainer>
        <PageHeader title="Результаты сессии" />
        <EmptyState title="Не удалось загрузить итоги" description={status.message} />
      </PageContainer>
    )
  }

  const { summary } = status
  const skillIdsForMistakes = mistakeSkillIds(summary)
  const practiceExtra = state?.practiceExtra

  async function handleAgain(origin: PracticeExtraOrigin) {
    setResampling(true)
    const ids = await resolveLexicalCandidateWordIds(origin.filter)
    const wordIds = sampleWordBatch(ids, VOCAB_DRILL_BATCH_SIZE, Date.now())
    navigate('/session', {
      replace: true,
      state: { practiceExtra: { variant: origin.variant, wordIds, filter: origin.filter } },
    })
  }

  return (
    <PageContainer>
      <PageHeader title="Готово" />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 py-2">
            <span className="text-3xl font-semibold text-foreground">
              {summary.correctCount} / {summary.totalCount}
            </span>
            <span className="text-lg text-muted-foreground">{summary.percent}%</span>
          </div>

          <div className="flex gap-3">
            <StatTile label="Новые слова" value={summary.newSkillCount} />
            <StatTile label="Повторено" value={summary.reviewedSkillCount} />
          </div>
        </CardContent>
      </Card>

      {summary.hardestDimensions.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="mb-1 font-heading text-base font-medium text-foreground">
              Сложнее всего
            </h2>
            <div className="divide-y divide-border">
              {summary.hardestDimensions.map((entry) => (
                <HardestDimensionRow key={entry.key} entry={entry} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary.mistakes.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="mb-1 font-heading text-base font-medium text-foreground">Ошибки</h2>
            <ul>
              {summary.mistakes.map((entry) => (
                <MistakeRow key={entry.skillId} entry={entry} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {practiceExtra ? (
        <>
          {skillIdsForMistakes.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              onClick={() => {
                navigate('/session', { state: { skillIds: skillIdsForMistakes } })
              }}
            >
              Разобрать ошибки
            </Button>
          )}
          <PracticeDrillActions
            onAgain={() => void handleAgain(practiceExtra)}
            againDisabled={resampling}
            onBackToList={() => navigate('/practice')}
          />
        </>
      ) : (
        <div className="flex gap-3">
          {skillIdsForMistakes.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 flex-1"
              onClick={() => {
                navigate('/session', { state: { skillIds: skillIdsForMistakes } })
              }}
            >
              Разобрать ошибки
            </Button>
          )}
          <Button
            type="button"
            className="min-h-11 flex-1"
            onClick={() => {
              navigate('/')
            }}
          >
            Закончить
          </Button>
        </div>
      )}
    </PageContainer>
  )
}

export default SessionResultPage
