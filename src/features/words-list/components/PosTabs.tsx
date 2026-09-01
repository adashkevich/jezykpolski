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
  { value: 'NOUN', label: 'Сущ.' },
  { value: 'VERB', label: 'Глаголы' },
  { value: 'ADJ', label: 'Прил.' },
  { value: 'ADV', label: 'Наречия' },
]

export function PosTabs() {
  const pos = useFiltersStore((s) => s.pos)
  const setPos = useFiltersStore((s) => s.setPos)

  return (
    <div
      role="tablist"
      aria-label="Часть речи"
      className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1"
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
              'flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
