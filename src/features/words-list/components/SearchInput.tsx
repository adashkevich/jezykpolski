/**
 * `/words` search field (`spec/tasks/07-words-list.md` §4, FR-27): one field, searches both
 * the Polish lemma and the Russian translation (the actual matching — including diacritic
 * folding, `zolty` → `żółty` — lives in `content/index-store.ts#normalizeSearchText` /
 * `content/query.ts`, already exercised by task 04's tests; this component only owns the
 * input UX).
 *
 * Debounced 200ms: the field is bound to local state so every keystroke stays instant, and
 * only after 200ms of no further typing does the committed value reach `filters.store`
 * (which re-runs `queryWords` over all 7998 words and re-persists the filter set) — typing
 * fast at 7998-word scale would otherwise mean a full re-filter per keystroke.
 */
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CONTROL_CLASS } from '@/components/ui/control.ts'
import { cn } from '@/lib/utils'
import { useFiltersStore } from '@/stores/filters.store.ts'

const DEBOUNCE_MS = 200

export function SearchInput() {
  const committedSearch = useFiltersStore((s) => s.search)
  const setSearch = useFiltersStore((s) => s.setSearch)
  const [value, setValue] = useState(committedSearch)
  // Tracks the last `committedSearch` this component has already reconciled `value` against,
  // so an external change (filter reset, hydration from a persisted visit) can be picked up
  // without fighting the debounce below for normal typing.
  const [lastSeenCommitted, setLastSeenCommitted] = useState(committedSearch)

  // React's "adjusting state during render" pattern (not a `useEffect`, deliberately —
  // `react-hooks/set-state-in-effect` flags a same-tick `setState` inside an effect body,
  // and this really is just "the source of truth changed, reset local state to match" rather
  // than a synchronization with anything external to React).
  if (committedSearch !== lastSeenCommitted) {
    setLastSeenCommitted(committedSearch)
    setValue(committedSearch)
  }

  useEffect(() => {
    if (value === useFiltersStore.getState().search) return
    const timer = setTimeout(() => setSearch(value), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, setSearch])

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-foreground"
      />
      <input
        type="search"
        role="searchbox"
        aria-label="Поиск слов по польской лемме или русскому переводу"
        placeholder="być или быть…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cn(
          CONTROL_CLASS,
          'h-14 w-full rounded-2xl border-border pr-13 pl-12 shadow-card placeholder:text-muted-foreground md:text-body-lg [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => setValue('')}
          className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      )}
    </div>
  )
}
