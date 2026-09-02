/**
 * "Формы слова" — collapsible, closed by default (`spec/tasks/08-word-detail.md` §3, FR-42,
 * acceptance points 1 and 9). Does not render at all for the 14 paradigm-less words
 * (acceptance point 4: absent, not an empty/disabled block) — `WordDetailPage` only mounts
 * this component when `entry.paradigmShard !== -1`, so that check isn't duplicated here.
 *
 * Expanding the disclosure is the ONE thing that calls `lazyParadigm.load()` — collapsing it
 * back does not discard already-fetched data (no point re-fetching on next expand), it's a
 * pure `open` toggle.
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import type { PosValue } from '@/content/codec.ts'
import type { Paradigm } from '@/types/content.ts'
import type { LazyParadigm } from '../hooks/useLazyParadigm.ts'
import { NounFormsTable } from './forms/NounFormsTable.tsx'
import { VerbFormsTable } from './forms/VerbFormsTable.tsx'
import { AdjFormsTable } from './forms/AdjFormsTable.tsx'
import { AdvFormsTable } from './forms/AdvFormsTable.tsx'

function FormsTables({ pos, paradigm }: { pos: PosValue; paradigm: Paradigm }) {
  switch (pos) {
    case 'NOUN':
      return <NounFormsTable paradigm={paradigm} />
    case 'VERB':
      return <VerbFormsTable paradigm={paradigm} />
    case 'ADJ':
      return <AdjFormsTable paradigm={paradigm} />
    case 'ADV':
      return <AdvFormsTable paradigm={paradigm} />
  }
}

export function FormsSection({ pos, lazyParadigm }: { pos: PosValue; lazyParadigm: LazyParadigm }) {
  const [open, setOpen] = useState(false)

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) lazyParadigm.load()
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="font-heading text-base font-medium text-foreground">Формы слова</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div>
          {lazyParadigm.status === 'loading' && (
            <p className="text-sm text-muted-foreground">Загрузка форм…</p>
          )}

          {lazyParadigm.status === 'error' && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">
                Не удалось загрузить формы
                {lazyParadigm.error ? `: ${lazyParadigm.error.message}` : ''}.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={lazyParadigm.load}>
                Повторить
              </Button>
            </div>
          )}

          {lazyParadigm.status === 'loaded' &&
            (lazyParadigm.paradigm ? (
              <FormsTables pos={pos} paradigm={lazyParadigm.paradigm} />
            ) : (
              <p className="text-sm text-muted-foreground">У этого слова нет форм.</p>
            ))}
        </div>
      )}
    </section>
  )
}
