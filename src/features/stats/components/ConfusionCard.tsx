/**
 * "Ты часто путаешь X ↔ Y" card (`spec/tasks/27-context-and-error-analysis.md` §1,
 * FR-104/FR-105, `spec/app-design.md` §20 "Ошибки тоже надо использовать"). Shows only the
 * single most frequent confusion pair (this task's own UI decision — the task text left the
 * exact presentation open, "топ-1 или топ-2-3, на твоё усмотрение"; one clear headline is
 * more actionable than a ranked list on a screen that's explicitly "без стриков и бейджей",
 * per `StatsPage.tsx`'s own header) — `getConfusionMatrix()` already sorts by count
 * descending, so this only ever reads its first entry.
 *
 * "Потренировать" builds an ordinary `PracticeConfig` (section NOUN, singular, both
 * confused cases checked, no status/level/frequency restriction) and navigates to
 * `/session` exactly the way `TrainingSetupScreen`'s own "Начать" button does
 * (`{ state: { practiceConfig } }` -> `session-scope.ts#parseSessionScope` -> `{ kind:
 * 'practice' }`) — the *same* mechanism, not a parallel one. This task's own decision,
 * recorded here since the task text asks to reuse `resolvePracticeCandidateWords`'s "path"
 * without pinning down whether that means restricting the session to the pair's own
 * `exampleWordIds`: `PracticeConfig` has no field for an explicit word-id allowlist, and
 * building one here would mean extending `learning/session/session.types.ts`/
 * `build-practice-queue.ts` beyond what this card needs — a broad "drill genitive vs.
 * locative on every matching noun" session already satisfies FR-105 ("собирает
 * practice-очередь из двух путаемых измерений") through the exact existing pipeline.
 * `exampleWordIds` are still shown as a hint of which real words triggered the pattern.
 */
import { useNavigate } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Button } from '@/components/ui/button.tsx'
import { CASE_LABELS } from '@/learning/skills/dimensions.ts'
import type { ConfusionPair } from '@/db/repositories/confusion.repository.ts'
import type { PracticeConfig } from '@/learning/session/session.types.ts'
import { getIndexStore } from '@/content/index-store.ts'

function practiceConfigFor(pair: ConfusionPair): PracticeConfig {
  return {
    section: 'NOUN',
    upToLevel: null,
    status: [],
    topN: null,
    includeTranslation: false,
    dimensionSelection: { number: ['sg'], case: [pair.caseA, pair.caseB] },
    exerciseTypes: { choice: true, input: true },
    targetSize: 20,
  }
}

export function ConfusionCard({ pair }: { pair: ConfusionPair }) {
  const navigate = useNavigate()

  const exampleLemmas = pair.exampleWordIds
    .map((wordId) => getIndexStore().byId.get(wordId)?.lemma)
    .filter((lemma): lemma is string => Boolean(lemma))

  function handlePractice() {
    navigate('/session', { state: { practiceConfig: practiceConfigFor(pair) } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Частая путаница</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-base text-foreground">
          Ты часто путаешь{' '}
          <span className="font-semibold">{CASE_LABELS[pair.caseA].pl}</span> (
          {CASE_LABELS[pair.caseA].ru.toLowerCase()}) ↔{' '}
          <span className="font-semibold">{CASE_LABELS[pair.caseB].pl}</span> (
          {CASE_LABELS[pair.caseB].ru.toLowerCase()}).
        </p>
        {exampleLemmas.length > 0 && (
          <p className="text-sm text-muted-foreground">Например: {exampleLemmas.join(', ')}</p>
        )}
        <Button type="button" onClick={handlePractice} className="min-h-11 self-start">
          Потренировать
        </Button>
      </CardContent>
    </Card>
  )
}
