/**
 * Status / frequency / sort controls for `/words`, plus the "Найдено N" result count
 * (`spec/tasks/07-words-list.md` §3, FR-24/FR-25/FR-26).
 *
 * These three are `<select>`s ("селекты" per the task text) that always live inside a
 * shadcn `Sheet` sliding up from the bottom — a "шторка", not a bare dropdown. The task text
 * only requires the sheet *on mobile* ("На мобильном раскрываются в шторке... а не в
 * выпадающем меню"), implying a plainer inline layout would be acceptable on wider
 * viewports. This deliberately uses the sheet at every breakpoint instead of maintaining two
 * parallel layouts (inline `<select>`s on desktop, a sheet on mobile) for the same three
 * controls — half the DOM, half the tests, and a slide-up panel is a perfectly normal
 * desktop pattern too (see the final report's "deviations" section for this call).
 *
 * Level chips, POS tabs and the search field stay directly on the page (`WordsListPage.tsx`)
 * — the app-design mockup shows those unconditionally visible, not tucked behind a trigger.
 */
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet.tsx'
import { useFiltersStore, type SortOption, type TopNOption } from '@/stores/filters.store.ts'
import type { WordStatus } from '@/types/progress.ts'

const STATUS_OPTIONS: ReadonlyArray<{ value: WordStatus | null; label: string }> = [
  { value: null, label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'learning', label: 'Изучаю' },
  { value: 'known', label: 'Знаю' },
  { value: 'mastered', label: 'Освоено' },
]

const TOP_N_OPTIONS: ReadonlyArray<{ value: TopNOption; label: string }> = [
  { value: null, label: 'Все' },
  { value: 500, label: 'Топ 500' },
  { value: 1000, label: 'Топ 1000' },
  { value: 2000, label: 'Топ 2000' },
  { value: 5000, label: 'Топ 5000' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  { value: 'frequency', label: 'По частоте' },
  { value: 'level', label: 'По уровню' },
  { value: 'alphabetical', label: 'По алфавиту' },
]

const selectClassName =
  'h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function FilterSheet({ resultCount }: { resultCount: number }) {
  const [open, setOpen] = useState(false)
  const status = useFiltersStore((s) => s.status)
  const setStatus = useFiltersStore((s) => s.setStatus)
  const topN = useFiltersStore((s) => s.topN)
  const setTopN = useFiltersStore((s) => s.setTopN)
  const sort = useFiltersStore((s) => s.sort)
  const setSort = useFiltersStore((s) => s.setSort)

  const activeCount = (status !== null ? 1 : 0) + (topN !== null ? 1 : 0)

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Найдено {resultCount.toLocaleString('ru-RU')}
      </p>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11 gap-1.5">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Фильтры
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
              >
                {activeCount}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Фильтры и сортировка</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Статус
              <select
                value={status ?? ''}
                onChange={(e) => setStatus((e.target.value || null) as WordStatus | null)}
                className={selectClassName}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Частотность
              <select
                value={topN ?? ''}
                onChange={(e) =>
                  setTopN((e.target.value ? Number(e.target.value) : null) as TopNOption)
                }
                className={selectClassName}
              >
                {TOP_N_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Сортировка
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className={selectClassName}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
