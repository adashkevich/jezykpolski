/**
 * `/words/:wordId` — the word detail card (`spec/tasks/08-word-detail.md`, FR-40…FR-48).
 *
 * `WordDetailPage` itself only resolves `:wordId` -> a `WordIndexEntry` (or renders the
 * "not found" state) — it calls no hooks beyond `useParams`/`useMemo`, so the "not found"
 * early return never skips a hook call. Everything that needs the entry to exist lives in
 * `WordDetailContent`, mounted only once `entry` is known, where every hook this screen
 * needs (`useSenses`, `useWordProgress`, `useWordSkills`, `useLazyParadigm`) is called
 * unconditionally, same as any other page in this app.
 *
 * One `useLazyParadigm` instance is shared between `FormsSection` (which triggers the fetch
 * on expand) and `ProgressSection` (which only reads the result) — see that hook's own
 * header for why this is a single source of truth rather than two independent fetches.
 */
import { useMemo } from 'react'
import { useParams } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { parseWordParam } from '@/app/word-path.ts'
import { getIndexStore } from '@/content/index-store.ts'
import { getPrimaryTranslation } from '@/content/senses.ts'
import { useWordProgress } from '@/hooks/useWordProgress.ts'
import { useWordSkills } from '@/hooks/useWordSkills.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { useLazyParadigm } from '@/features/word-detail/hooks/useLazyParadigm.ts'
import { useSenses } from '@/features/word-detail/hooks/useSenses.ts'
import { WordHeader } from '@/features/word-detail/components/WordHeader.tsx'
import { SensesList } from '@/features/word-detail/components/SensesList.tsx'
import { FormsSection } from '@/features/word-detail/components/FormsSection.tsx'
import { ProgressSection } from '@/features/word-detail/components/ProgressSection.tsx'
import { WordActions } from '@/features/word-detail/components/WordActions.tsx'

export function WordDetailPage() {
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

  if (!wordId || !entry) {
    return (
      <PageContainer>
        <PageHeader
          title="Слово не найдено"
          description="Некорректный или отсутствующий идентификатор слова в адресе."
        />
      </PageContainer>
    )
  }

  return <WordDetailContent wordId={wordId} entry={entry} />
}

function WordDetailContent({ wordId, entry }: { wordId: WordId; entry: WordIndexEntry }) {
  const primaryTranslation = getPrimaryTranslation(wordId)
  const { status: sensesStatus, senses, error: sensesError } = useSenses(wordId)
  const wordProgress = useWordProgress(wordId)
  const skills = useWordSkills(wordId)
  const lazyParadigm = useLazyParadigm(wordId)
  const hasParadigm = entry.paradigmShard !== -1

  return (
    <PageContainer className="gap-5">
      <WordHeader
        entry={entry}
        primaryTranslation={primaryTranslation}
        paradigm={lazyParadigm.paradigm}
      />

      <SensesList status={sensesStatus} senses={senses} error={sensesError} />

      {hasParadigm && <FormsSection pos={entry.pos} lazyParadigm={lazyParadigm} />}

      <ProgressSection
        entry={entry}
        wordProgress={wordProgress}
        hasParadigm={hasParadigm}
        paradigm={lazyParadigm.paradigm}
        skills={skills}
      />

      <WordActions wordId={wordId} lemma={entry.lemma} />
    </PageContainer>
  )
}

export default WordDetailPage
