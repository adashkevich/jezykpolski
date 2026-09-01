/**
 * Level chips + "До уровня X" toggle (`spec/tasks/07-words-list.md` §3, FR-21/FR-22).
 *
 * Two mutually exclusive interaction modes over the same six chips:
 *  - `upToMode` off (default): plain multi-select — each chip toggles independently
 *    (`filters.store#toggleLevel`), feeding `WordQuery.levels`.
 *  - `upToMode` on: the chips become single-select ("radio-like" — picking one deselects
 *    any other), and the picked level feeds `WordQuery.upToLevel` instead ("A1 + A2 + B1"
 *    for a B1 pick) — FR-22's "основной сценарий обучения".
 *
 * Touch targets are `min-h-11` (44px) throughout — NFR-11.
 */
import { LEVEL_VALUES } from '@/content/codec.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'
import { cn } from '@/lib/utils'

export function LevelFilter() {
  const levels = useFiltersStore((s) => s.levels)
  const upToMode = useFiltersStore((s) => s.upToMode)
  const upToLevel = useFiltersStore((s) => s.upToLevel)
  const toggleLevel = useFiltersStore((s) => s.toggleLevel)
  const setUpToMode = useFiltersStore((s) => s.setUpToMode)
  const setUpToLevel = useFiltersStore((s) => s.setUpToLevel)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Уровень">
        {LEVEL_VALUES.map((level) => {
          const active = upToMode ? upToLevel === level : levels.includes(level)
          return (
            <button
              key={level}
              type="button"
              aria-pressed={active}
              onClick={() => (upToMode ? setUpToLevel(level) : toggleLevel(level))}
              className={cn(
                'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {level}
            </button>
          )
        })}
      </div>
      <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={upToMode}
          onChange={(e) => setUpToMode(e.target.checked)}
          className="size-4 rounded border-border"
        />
        До уровня {upToLevel ?? LEVEL_VALUES[LEVEL_VALUES.length - 1]}
      </label>
    </div>
  )
}
