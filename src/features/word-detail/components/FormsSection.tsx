/**
 * "Формы слова" — always expanded for every POS that has one: NOUN's "Формы и склонение",
 * VERB's "Формы и спряжение", ADJ's own "Формы и склонение" (`spec/design/word-noun.png` /
 * `word-verb.png` / `word-adjective.png`) and ADV's "Формы слова" (only degrees of comparison,
 * nothing to decline). None of them have a disclosure control — they load their paradigm on
 * mount instead of on click. Does not render at all for the 14 paradigm-less words (acceptance
 * point 4: absent, not an empty/disabled block) — `WordDetailPage` only mounts this component
 * when `entry.paradigmShard !== -1`, so that check isn't duplicated here.
 *
 * `wordId`/`skills` (task 17, `spec/tasks/17-nouns-section.md` §4) were threaded through only
 * as far as `NounFormsTable` at first — the one table task 17 made clickable. Task 20
 * (`spec/tasks/20-verbs-section.md`) extends the same click-to-train mechanism to
 * `VerbFormsTable`, reusing task 17's identical `targetSkillIds` navigation rather than a new
 * one. Task 22 (`spec/tasks/22-adjectives-section.md`) extends it once more, to `AdjFormsTable`/
 * `AdvFormsTable` — but only for their shared `DegreeComparisonBlock` rows, not the ADJ case x
 * gender grid (that grid stays plain display; see `AdjFormsTable.tsx`'s own header for why).
 *
 * Task 25 (`spec/tasks/25-offline-update.md` §7) makes the error branch offline-aware: a
 * paradigm shard that was never fetched before (not in the SW's runtime cache, task 24's
 * opt-in prefetch never ran) and can't be reached now because the device is offline is an
 * expected, explainable state ("Формы недоступны офлайн", pointing at `/settings`) — not the
 * same generic "Не удалось загрузить формы: <message>" + Retry shown for a genuine (online)
 * failure, where retrying is actually the useful next step.
 */
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'
import { useOnlineStatus } from '@/hooks/useOnlineStatus.ts'
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
  const alwaysOpen = pos === 'NOUN' || pos === 'VERB' || pos === 'ADJ' || pos === 'ADV'
  const [open, setOpen] = useState(alwaysOpen)
  const online = useOnlineStatus()

  // NOUN's "Формы и склонение" / VERB's "Формы и спряжение" / ADJ's "Формы и склонение" are
  // always expanded (never collapsible) — load their paradigm as soon as the section mounts
  // instead of waiting for a disclosure click that doesn't exist.
  useEffect(() => {
    if (alwaysOpen) lazyParadigm.load()
  }, [alwaysOpen, wordId, lazyParadigm.load])

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) lazyParadigm.load()
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      {alwaysOpen ? (
        <h2 className="font-heading text-headline-md text-foreground">
          {pos === 'VERB' ? 'Формы и спряжение' : pos === 'ADV' ? 'Формы слова' : 'Формы и склонение'}
        </h2>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="-m-1 flex min-h-11 items-center justify-between gap-2 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="font-heading text-headline-md text-foreground">Формы слова</span>
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
          >
            <ChevronDown
              className={cn(
                'size-5 text-foreground transition-transform motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
      )}

      {open && (
        <div>
          {lazyParadigm.status === 'loading' && (
            <p className="text-body-sm text-muted-foreground">Загрузка форм…</p>
          )}

          {lazyParadigm.status === 'error' &&
            (online ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-body-sm text-destructive">
                  Не удалось загрузить формы
                  {lazyParadigm.error ? `: ${lazyParadigm.error.message}` : ''}.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={lazyParadigm.load}>
                  Повторить
                </Button>
              </div>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Формы недоступны офлайн. Откройте это слово ещё раз при подключении к сети — или
                включите заранее в{' '}
                <Link to="/settings" className="text-foreground underline underline-offset-2">
                  настройках
                </Link>{' '}
                загрузку всех форм для офлайна.
              </p>
            ))}

          {lazyParadigm.status === 'loaded' &&
            (lazyParadigm.paradigm ? (
              <FormsTables
                pos={pos}
                wordId={wordId}
                paradigm={lazyParadigm.paradigm}
                skills={skills}
              />
            ) : (
              <p className="text-body-sm text-muted-foreground">У этого слова нет форм.</p>
            ))}
        </div>
      )}
    </section>
  )
}
