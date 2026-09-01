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
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        role="searchbox"
        aria-label="Поиск слов по польской лемме или русскому переводу"
        placeholder="być или быть…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full rounded-lg border border-border bg-background pr-11 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {value && (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => setValue('')}
          className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
}
