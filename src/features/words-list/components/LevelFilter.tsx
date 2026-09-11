/**
 * Level chips (`spec/tasks/07-words-list.md` §3, FR-21).
 *
 * Plain multi-select — each chip toggles independently (`filters.store#toggleLevel`),
 * feeding `WordQuery.levels`.
 *
 * Touch targets are `min-h-11` (44px) throughout — NFR-11.
 */
import { LEVEL_VALUES } from '@/content/codec.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'
import { cn } from '@/lib/utils'

export function LevelFilter() {
  const levels = useFiltersStore((s) => s.levels)
  const toggleLevel = useFiltersStore((s) => s.toggleLevel)

  return (
    <div
      className="grid grid-cols-6 gap-1.5 rounded-2xl border border-border bg-card p-2 shadow-card"
      role="group"
      aria-label="Уровень"
    >
      {LEVEL_VALUES.map((level) => {
        const active = levels.includes(level)
        return (
          <button
            key={level}
            type="button"
            aria-pressed={active}
            onClick={() => toggleLevel(level)}
            className={cn(
              'min-h-11 rounded-xl text-label-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              active
                ? 'bg-primary-strong text-primary-foreground'
                : 'bg-secondary text-foreground hover:bg-surface-high',
            )}
          >
            {level}
          </button>
        )
      })}
    </div>
  )
}
