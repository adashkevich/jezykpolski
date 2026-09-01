/**
 * "Значения" — `spec/tasks/08-word-detail.md` §2, FR-41: every sense listed, primary first
 * (already the order `content/senses.ts#getSenses` returns them in — this component doesn't
 * re-sort), Russian translations as the main text and the English gloss (when present) as a
 * small secondary line — "он полезен для снятия неоднозначности, но пользователь учит
 * русский↔польский" (task text), so `en` is never the primary line.
 */
import type { Sense } from '@/types/content.ts'
import type { SensesStatus } from '../hooks/useSenses.ts'

export function SensesList({
  status,
  senses,
  error,
}: {
  status: SensesStatus
  senses: readonly Sense[]
  error: Error | undefined
}) {
  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка значений…</p>
  }

  if (status === 'error') {
    return (
      <p className="text-sm text-destructive">
        Не удалось загрузить значения{error ? `: ${error.message}` : ''}.
      </p>
    )
  }

  if (senses.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-base font-medium text-foreground">Значения</h2>
      <ol className="flex flex-col gap-2.5">
        {senses.map((sense, index) => (
          <li key={index} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{index + 1}.</span>
              <span className="text-foreground">{sense.ru.join(', ')}</span>
              {sense.primary && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary">
                  основное
                </span>
              )}
            </div>
            {sense.en && <p className="pl-5 text-xs text-muted-foreground">{sense.en}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}
