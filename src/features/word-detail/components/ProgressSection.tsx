/**
 * "Прогресс" — two independent bars plus an expandable per-dimension breakdown
 * (`spec/tasks/08-word-detail.md` §4, FR-46/FR-47, `spec/architecture.md` §5.4/§5.5).
 *
 * The two top-level bars read `WordProgressRecord.vocabMaturity`/`morphMaturity` straight
 * from the denormalized cache (`useWordProgress`, task 05) rather than recomputing
 * `aggregateWord` client-side. This is a deliberate choice, not a shortcut: `wordProgress` IS
 * the persisted result of `aggregateWord` (`words-progress.repository.ts#computeWordProgress`
 * calls it directly), so reading the cache already satisfies acceptance point 7 ("совпадают
 * с расчётом aggregateWord") by construction — and unlike a client-side recompute here, it
 * stays correct even before the user has expanded "Формы слова" (the cache was built with
 * the real paradigm already, at whatever point `recomputeWordProgress` last ran; a
 * client-side `aggregateWord` call in THIS component, before `paradigm` has loaded, would
 * undercount every morphology skill this word may already have — `enumerateSkills` returns
 * vocab-only descriptors without a `Paradigm`).
 *
 * The per-dimension breakdown (FR-47) is different: it has no cached equivalent (the cache
 * only stores two scalars), so it's computed live from `useWordSkills` + `enumerateSkills` +
 * `buildDimensionBreakdown`. That does need `paradigm` loaded, so before the user has ever
 * expanded "Формы слова" this section shows a hint instead of a breakdown, rather than
 * triggering its own paradigm fetch (see `useLazyParadigm.ts`'s header for why it's one
 * shared load, gated only by the forms disclosure).
 */
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MASTERED_THRESHOLD } from '@/learning/progress/aggregate.ts'
import { enumerateSkills } from '@/learning/skills/enumerate.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord, WordProgressRecord } from '@/types/progress.ts'
import { buildDimensionBreakdown } from '../lib/dimension-breakdown.ts'
import { MaturityBar } from './MaturityBar.tsx'

/** ✓ once a dimension group is effectively mastered, "новое" when nothing has ever been
 *  recorded for it, a plain percentage in between — mirrors app-design.md §15's own
 *  illustration ("Mianownik ✓ / Narzędnik 72% / Wołacz новое"). Reuses `aggregate.ts`'s own
 *  `MASTERED_THRESHOLD` for the ✓ cutoff rather than inventing a second "done" threshold. */
function formatMaturity(value: number): string {
  if (value <= 0) return 'новое'
  if (value >= MASTERED_THRESHOLD) return '✓'
  return `${Math.round(value * 100)}%`
}

export function ProgressSection({
  entry,
  wordProgress,
  hasParadigm,
  paradigm,
  skills,
}: {
  entry: WordIndexEntry
  wordProgress: WordProgressRecord | undefined
  hasParadigm: boolean
  /** `undefined` (not loaded), `null` (loaded, has none) or a real `Paradigm` — mirrors
   *  `useLazyParadigm`'s own `paradigm` field, passed through as-is. */
  paradigm: Paradigm | null | undefined
  skills: readonly SkillRecord[] | undefined
}) {
  const [open, setOpen] = useState(false)

  const descriptors = useMemo(
    () => enumerateSkills(entry, paradigm ?? undefined),
    [entry, paradigm],
  )
  const known = useMemo<ReadonlyMap<SkillId, SkillRecord>>(
    () => new Map((skills ?? []).map((s) => [s.skillId, s])),
    [skills],
  )
  const groups = useMemo(
    () => buildDimensionBreakdown(entry.pos, descriptors, known),
    [entry.pos, descriptors, known],
  )

  const vocabMaturity = wordProgress?.vocabMaturity ?? 0
  const morphMaturity = wordProgress?.morphMaturity ?? 0

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h2 className="font-heading text-base font-medium text-foreground">Прогресс</h2>

      <div className="flex flex-col gap-3">
        <MaturityBar label="Слово" value={vocabMaturity} />
        {hasParadigm && <MaturityBar label="Формы" value={morphMaturity} />}
      </div>

      {hasParadigm && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary"
        >
          Детализация по измерениям
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', open && 'rotate-180')}
          />
        </button>
      )}

      {open &&
        (paradigm ? (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {group.rows.map((row) => (
                    <li key={row.key} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{row.label}</span>
                      <span className="text-muted-foreground">{formatMaturity(row.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Раскройте «Формы слова», чтобы увидеть детализацию по падежам/временам.
          </p>
        ))}
    </section>
  )
}
