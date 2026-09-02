/**
 * `/practice/verb-table/:wordId/:tense` — "Тренировать таблицей" on one `VerbFormsTable.tsx`
 * tab (`spec/tasks/21-verb-exercises.md` step 5, FR-65). Sibling of `TablePracticePage.tsx`
 * (NOUN's own table-practice route, task 18) — see `../../features/session-runner/hooks/
 * useVerbTablePracticeSession.ts`'s header for why this is a separate route/hook/component
 * trio rather than a generalization of the NOUN one.
 *
 * `:tense` is one of `VerbTableTense` (`present`/`future`/`imperative`/`past`) — an invalid
 * or missing value falls through to the same "word not found"-shaped empty state the NOUN
 * page uses for a bad `:wordId`, rather than a second, differently-worded error screen.
 */
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'
import { parseWordParam, wordPath } from '@/app/word-path.ts'
import { getIndexStore } from '@/content/index-store.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { VerbTableTense } from '@/learning/exercises/generate.ts'
import { useVerbTablePracticeSession } from '@/features/session-runner/hooks/useVerbTablePracticeSession.ts'
import { VerbTableExercise } from '@/features/session-runner/components/VerbTableExercise.tsx'

const VERB_TABLE_TENSES: readonly VerbTableTense[] = ['present', 'future', 'imperative', 'past']

const TENSE_TITLE: Readonly<Record<VerbTableTense, string>> = {
  present: 'Настоящее время',
  future: 'Будущее время',
  imperative: 'Повелительное наклонение',
  past: 'Прошедшее время',
}

function isVerbTableTense(value: string): value is VerbTableTense {
  return (VERB_TABLE_TENSES as readonly string[]).includes(value)
}

function VerbTablePracticeContent({ wordId, tense }: { wordId: WordId; tense: VerbTableTense }) {
  const navigate = useNavigate()
  const { status, recordCellResult, finish } = useVerbTablePracticeSession(wordId, tense)

  async function handleDone() {
    await finish()
    navigate(wordPath(wordId))
  }

  return (
    <PageContainer>
      <PageHeader
        title={`Таблица спряжения — ${TENSE_TITLE[tense]}`}
        description="Заполните форму для каждого лица — каждая ячейка проверяется сразу и обновляет свой навык в режиме Practice."
      />

      {status.phase === 'loading' && (
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-muted-foreground">
          Готовим таблицу…
        </p>
      )}

      {status.phase === 'error' && (
        <EmptyState
          title="Не удалось запустить тренировку"
          description={status.message}
          action={
            <Button type="button" onClick={() => navigate(wordPath(wordId))} className="min-h-11">
              К слову
            </Button>
          }
        />
      )}

      {status.phase === 'ready' && (
        <VerbTableExercise
          wordId={wordId}
          sessionId={status.sessionId}
          tense={tense}
          exercise={status.exercise}
          onCellGraded={recordCellResult}
          onDone={() => void handleDone()}
        />
      )}
    </PageContainer>
  )
}

export function VerbTablePracticePage() {
  const { wordId: rawWordId, tense: rawTense } = useParams<{ wordId: string; tense: string }>()

  const wordId = useMemo<WordId | null>(() => {
    if (!rawWordId) return null
    try {
      return parseWordParam(rawWordId)
    } catch {
      return null
    }
  }, [rawWordId])

  const entry = wordId ? getIndexStore().byId.get(wordId) : undefined
  const tense = rawTense && isVerbTableTense(rawTense) ? rawTense : null

  if (!wordId || !entry || entry.pos !== 'VERB' || entry.paradigmShard === -1 || !tense) {
    return (
      <PageContainer>
        <PageHeader
          title="Слово не найдено"
          description="Некорректный идентификатор глагола, время, или у него нет форм для тренировки таблицей."
        />
      </PageContainer>
    )
  }

  return <VerbTablePracticeContent wordId={wordId} tense={tense} />
}

export default VerbTablePracticePage
