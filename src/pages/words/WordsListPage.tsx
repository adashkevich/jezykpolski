/**
 * `/words` — browsing screen for all 7998 lemmas (`spec/tasks/07-words-list.md`, FR-20…FR-30).
 *
 * Layout is a fixed-height flex column (`PageContainer className="h-full"`) with exactly one
 * scrolling region: `VirtualWordList`'s own scroll container. Everything above it (header,
 * search, POS tabs, level chips, filter sheet trigger) is non-scrolling chrome, matching the
 * `app-design.md` §3 mockup where those controls sit above a single scrollable list rather
 * than scrolling away with it. The part below the search field is overlaid on the list's top
 * and slides away / back out with the scroll (`useQuickReturnChrome`); the search field stays.
 *
 * `showFormsBar` — FR-46/step 5: once a specific POS tab (NOUN/VERB/ADJ; not "Все", not
 * ADV — FR-05 limits adverb morphology to `degree` only, `L`-priority, not modeled as a
 * "Формы" bar here) is active, every visible row additionally shows its morphology-maturity
 * bar. This is a page-level (not per-row) decision because the POS tab is a global,
 * single-select filter — see `PosTabs.tsx`'s file header.
 *
 * Swipe/button triage (task 16, `spec/tasks/16-swipe-triage.md`, FR-29): the Dexie write +
 * undo-toast bookkeeping is owned HERE, at the page level, not inside `WordRow`/
 * `VirtualWordList` — a swiped row's own React state cannot be trusted to survive the
 * `useUndoableAction` toast's few-second window, since `@tanstack/react-virtual` may recycle
 * that exact DOM slot for a different word if the user keeps scrolling in the meantime (see
 * `VirtualWordList.tsx`'s file header). `markWordKnown`/`markWordUnknown`
 * (`db/repositories/swipe.repository.ts`) each return a `TriageSnapshot` capturing exactly
 * what to restore, independent of any component's lifecycle.
 */
import { Pointer } from 'lucide-react'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { EmptyState } from '@/components/app/EmptyState.tsx'
import { UndoToast } from '@/components/app/UndoToast.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useFiltersStore } from '@/stores/filters.store.ts'
import { useFilteredWords } from '@/features/words-list/hooks/useFilteredWords.ts'
import { useQuickReturnChrome } from '@/features/words-list/hooks/useQuickReturnChrome.ts'
import { useUndoableAction } from '@/hooks/useUndoableAction.ts'
import { cn } from '@/lib/utils'
import { SearchInput } from '@/features/words-list/components/SearchInput.tsx'
import { PosTabs } from '@/features/words-list/components/PosTabs.tsx'
import { LevelFilter } from '@/features/words-list/components/LevelFilter.tsx'
import { FilterSheet } from '@/features/words-list/components/FilterSheet.tsx'
import { VirtualWordList } from '@/features/words-list/components/VirtualWordList.tsx'
import { markWordKnown, markWordUnknown, undoTriage } from '@/db/repositories/swipe.repository.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'

export function WordsListPage() {
  const pos = useFiltersStore((s) => s.pos)
  const reset = useFiltersStore((s) => s.reset)
  const { results, progress } = useFilteredWords()
  const { pending, show, confirmUndo, dismiss } = useUndoableAction()
  const hasResults = results.length > 0
  const { chromeRef, chromeHeight, onScroll: handleListScroll } = useQuickReturnChrome(hasResults)

  const showFormsBar = pos === 'NOUN' || pos === 'VERB' || pos === 'ADJ'

  async function handleMarkKnown(entry: WordIndexEntry) {
    const wordId = encodeWordId(entry.lemma, entry.pos)
    const snapshot = await markWordKnown(wordId)
    show(`«${entry.lemma}»: знаю`, () => undoTriage(snapshot))
  }

  async function handleMarkUnknown(entry: WordIndexEntry) {
    const wordId = encodeWordId(entry.lemma, entry.pos)
    const snapshot = await markWordUnknown(wordId)
    show(`«${entry.lemma}»: не знаю — добавлено к изучению`, () => undoTriage(snapshot))
  }

  return (
    // `pb-0`: the list is its own scroll container, so it runs right down to the nav bar
    // instead of leaving a dead strip of page padding above it.
    <PageContainer className="h-full gap-3 pb-0">
      <PageHeader
        title="Слова"
        description="Браузер по всем 7998 леммам всех частей речи."
        visuallyHidden
      />

      <SearchInput />

      {/* Clip box for the quick-return chrome (`useQuickReturnChrome`): the chrome is overlaid
          on the list's top edge and slides up out of this box. The negative-margin bleed
          matches `PageContainer`'s padding so `PosTabs`' own edge-to-edge bleed isn't clipped.
          With no results there's no list to overlay, so the chrome falls back to normal flow. */}
      <div className="relative -mx-4 flex min-h-0 flex-1 flex-col overflow-hidden px-4 min-[480px]:-mx-6 min-[480px]:px-6">
        <div
          ref={chromeRef}
          className={cn(
            'flex flex-col gap-3 bg-background pb-3',
            hasResults &&
              'absolute inset-x-0 top-0 z-10 px-4 will-change-transform min-[480px]:px-6',
          )}
        >
          <PosTabs />
          <LevelFilter />
          <FilterSheet resultCount={results.length} />
          {hasResults && (
            <div className="flex items-center justify-between gap-3 px-1 text-label-md text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Pointer aria-hidden="true" className="size-4" />
                Свайп влево: учить · вправо: знаю
              </span>
              <span className="font-semibold tracking-[0.06em] uppercase">Статус</span>
            </div>
          )}
        </div>

        {hasResults ? (
          <VirtualWordList
            words={results}
            progress={progress}
            showFormsBar={showFormsBar}
            onMarkKnown={handleMarkKnown}
            onMarkUnknown={handleMarkUnknown}
            onScroll={handleListScroll}
            paddingStart={chromeHeight}
          />
        ) : (
          <EmptyState
            title="Ничего не найдено"
            description="Ни одно слово не подходит под текущие фильтры. Попробуйте изменить их или сбросить."
            action={
              <Button type="button" onClick={reset} className="min-h-11">
                Сбросить фильтры
              </Button>
            }
          />
        )}
      </div>

      {pending && (
        <UndoToast message={pending.message} onUndo={confirmUndo} onDismiss={dismiss} />
      )}
    </PageContainer>
  )
}

export default WordsListPage
