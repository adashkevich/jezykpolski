/**
 * `/words` — browsing screen for all 7998 lemmas (`spec/tasks/07-words-list.md`, FR-20…FR-30).
 *
 * Layout is a fixed-height flex column (`PageContainer className="h-full"`) with exactly one
 * scrolling region: `VirtualWordList`'s own scroll container. Everything above it (header,
 * search, POS tabs, level chips, filter sheet trigger) is non-scrolling chrome, matching the
 * `app-design.md` §3 mockup where those controls sit above a single scrollable list rather
 * than scrolling away with it.
 *
 * `showFormsBar` — FR-46/step 5: once a specific POS tab (NOUN/VERB/ADJ; not "Все", not
 * ADV — FR-05 limits adverb morphology to `degree` only, `L`-priority, not modeled as a
 * "Формы" bar here) is active, every visible row additionally shows its morphology-maturity
 * bar. This is a page-level (not per-row) decision because the POS tab is a global,
 * single-select filter — see `PosTabs.tsx`'s file header.
 */
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useFiltersStore } from '@/stores/filters.store.ts'
import { useFilteredWords } from '@/features/words-list/hooks/useFilteredWords.ts'
import { SearchInput } from '@/features/words-list/components/SearchInput.tsx'
import { PosTabs } from '@/features/words-list/components/PosTabs.tsx'
import { LevelFilter } from '@/features/words-list/components/LevelFilter.tsx'
import { FilterSheet } from '@/features/words-list/components/FilterSheet.tsx'
import { VirtualWordList } from '@/features/words-list/components/VirtualWordList.tsx'
import { LearnFab } from '@/features/words-list/components/LearnFab.tsx'

export function WordsListPage() {
  const pos = useFiltersStore((s) => s.pos)
  const reset = useFiltersStore((s) => s.reset)
  const { query, results, progress } = useFilteredWords()

  const showFormsBar = pos === 'NOUN' || pos === 'VERB' || pos === 'ADJ'

  return (
    <PageContainer className="h-full">
      <PageHeader title="Слова" description="Браузер по всем 7998 леммам всех частей речи." />

      <div className="flex flex-col gap-3">
        <SearchInput />
        <PosTabs />
        <LevelFilter />
        <FilterSheet resultCount={results.length} />
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="Ничего не найдено"
          description="Ни одно слово не подходит под текущие фильтры. Попробуйте изменить их или сбросить."
          action={
            <Button type="button" onClick={reset} className="min-h-11">
              Сбросить фильтры
            </Button>
          }
        />
      ) : (
        <VirtualWordList words={results} progress={progress} showFormsBar={showFormsBar} />
      )}

      <LearnFab query={query} />
    </PageContainer>
  )
}

export default WordsListPage
