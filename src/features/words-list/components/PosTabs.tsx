/**
 * In-page part-of-speech tabs for `/words` (`spec/tasks/07-words-list.md` §5, FR-23,
 * FR-46): `Все · Сущ. · Глаголы · Прил. · Наречия`.
 *
 * Distinct from `src/pages/words/PosSwitcher.tsx` (task 06): that component *navigates* to
 * the sibling `/nouns`, `/verbs`, `/adjectives` routes (themselves still stubs — FR-02/03/04
 * are later, `S`-priority tasks out of this task's scope) and has no "Наречия" entry at all.
 * This component instead sets the in-page `pos` filter on `/words` itself (single-select;
 * "Все" clears it) and, per the task text, doubles as what turns the row's second "Формы"
 * progress bar on — see `WordsListPage.tsx`'s `showFormsBar` derivation, which is `true`
 * exactly when a NOUN/VERB/ADJ tab (not "Все", not "Наречия" — FR-05/step 5) is active.
 * Keeping both components lets the (out-of-scope) sibling route stubs keep working exactly
 * as task 06 shipped them, while this task's own filter concern lives entirely here.
 */
import { useFiltersStore } from '@/stores/filters.store.ts'
import { cn } from '@/lib/utils'
import type { PosValue } from '@/content/codec.ts'

const TABS: ReadonlyArray<{ value: PosValue | null; label: string }> = [
  { value: null, label: 'Все' },
  { value: 'NOUN', label: 'Существительные' },
  { value: 'VERB', label: 'Глаголы' },
  { value: 'ADJ', label: 'Прилагательные' },
  { value: 'ADV', label: 'Наречия' },
]

export function PosTabs() {
  const pos = useFiltersStore((s) => s.pos)
  const setPos = useFiltersStore((s) => s.setPos)

  return (
    // Full-bleed horizontal chip strip (`spec/design/words.png`): cancels `PageContainer`'s
    // side padding so the chips scroll edge to edge instead of clipping at the margin.
    <div
      role="tablist"
      aria-label="Часть речи"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] min-[480px]:-mx-6 min-[480px]:px-6 [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        const active = pos === tab.value
        return (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPos(tab.value)}
            className={cn(
              'flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-4 text-label-lg whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-surface-low',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
