/**
 * `/practice/table/:wordId` — "Тренировать таблицей" (`spec/tasks/18-noun-exercises.md`
 * step 4, FR-62). A dedicated route rather than another `/session` scope — see
 * `features/session-runner/hooks/useTablePracticeSession.ts`'s header for why the `table`
 * exercise doesn't reuse `SessionRunner`'s queue machinery at all.
 *
 * `:wordId` reuses the same `parseWordParam` encoding `/words/:wordId` does
 * (`app/word-path.ts`) — `NounFormsTable.tsx`'s "Тренировать таблицей" button builds this
 * URL with the matching `encodeURIComponent`.
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
import { useTablePracticeSession } from '@/features/session-runner/hooks/useTablePracticeSession.ts'
import { TableExercise } from '@/features/session-runner/components/TableExercise.tsx'

function TablePracticeContent({ wordId }: { wordId: WordId }) {
  const navigate = useNavigate()
  const { status, recordCellResult, finish } = useTablePracticeSession(wordId)

  async function handleDone() {
    await finish()
    navigate(wordPath(wordId))
  }

  return (
    <PageContainer>
      <PageHeader
        title="Таблица склонения"
        description="Заполните падежи — каждая ячейка проверяется сразу и обновляет свой навык в режиме Practice."
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
        <TableExercise
          wordId={wordId}
          sessionId={status.sessionId}
          exercise={status.exercise}
          onCellGraded={recordCellResult}
          onDone={() => void handleDone()}
        />
      )}
    </PageContainer>
  )
}

export function TablePracticePage() {
  const { wordId: rawWordId } = useParams<{ wordId: string }>()

  const wordId = useMemo<WordId | null>(() => {
    if (!rawWordId) return null
    try {
      return parseWordParam(rawWordId)
    } catch {
      return null
    }
  }, [rawWordId])

  const entry = wordId ? getIndexStore().byId.get(wordId) : undefined

  if (!wordId || !entry || entry.paradigmShard === -1) {
    return (
      <PageContainer>
        <PageHeader
          title="Слово не найдено"
          description="Некорректный идентификатор слова, или у него нет форм для тренировки таблицей."
        />
      </PageContainer>
    )
  }

  return <TablePracticeContent wordId={wordId} />
}

export default TablePracticePage
