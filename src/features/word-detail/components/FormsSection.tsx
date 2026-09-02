/**
 * "Формы слова" — collapsible, closed by default (`spec/tasks/08-word-detail.md` §3, FR-42,
 * acceptance points 1 and 9). Does not render at all for the 14 paradigm-less words
 * (acceptance point 4: absent, not an empty/disabled block) — `WordDetailPage` only mounts
 * this component when `entry.paradigmShard !== -1`, so that check isn't duplicated here.
 *
 * Expanding the disclosure is the ONE thing that calls `lazyParadigm.load()` — collapsing it
 * back does not discard already-fetched data (no point re-fetching on next expand), it's a
 * pure `open` toggle.
 *
 * `wordId`/`skills` (task 17, `spec/tasks/17-nouns-section.md` §4) were threaded through only
 * as far as `NounFormsTable` at first — the one table task 17 made clickable. Task 20
 * (`spec/tasks/20-verbs-section.md`) extends the same click-to-train mechanism to
 * `VerbFormsTable`, reusing task 17's identical `targetSkillIds` navigation rather than a new
 * one. Task 22 (`spec/tasks/22-adjectives-section.md`) extends it once more, to `AdjFormsTable`/
 * `AdvFormsTable` — but only for their shared `DegreeComparisonBlock` rows, not the ADJ case x
 * gender grid (that grid stays plain display; see `AdjFormsTable.tsx`'s own header for why).
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import type { PosValue } from '@/content/codec.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import type { LazyParadigm } from '../hooks/useLazyParadigm.ts'
import { NounFormsTable } from './forms/NounFormsTable.tsx'
import { VerbFormsTable } from './forms/VerbFormsTable.tsx'
import { AdjFormsTable } from './forms/AdjFormsTable.tsx'
import { AdvFormsTable } from './forms/AdvFormsTable.tsx'

function FormsTables({
  pos,
  wordId,
  paradigm,
  skills,
}: {
  pos: PosValue
  wordId: WordId
  paradigm: Paradigm
  skills: readonly SkillRecord[] | undefined
}) {
  switch (pos) {
    case 'NOUN':
      return <NounFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />
    case 'VERB':
      return <VerbFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />
    case 'ADJ':
      return <AdjFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />
    case 'ADV':
      return <AdvFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />
  }
}

export function FormsSection({
  pos,
  wordId,
  lazyParadigm,
  skills,
}: {
  pos: PosValue
  wordId: WordId
  lazyParadigm: LazyParadigm
  skills: readonly SkillRecord[] | undefined
}) {
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
              <FormsTables
                pos={pos}
                wordId={wordId}
                paradigm={lazyParadigm.paradigm}
                skills={skills}
              />
            ) : (
              <p className="text-sm text-muted-foreground">У этого слова нет форм.</p>
            ))}
        </div>
      )}
    </section>
  )
}
