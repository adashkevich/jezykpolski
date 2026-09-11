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
    return <p className="text-body-sm text-muted-foreground">Загрузка значений…</p>
  }

  if (status === 'error') {
    return (
      <p className="text-body-sm text-destructive">
        Не удалось загрузить значения{error ? `: ${error.message}` : ''}.
      </p>
    )
  }

  if (senses.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label-md font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Значения
      </h2>
      <ol className="flex flex-col gap-3">
        {senses.map((sense, index) => (
          <li key={index} className="grid grid-cols-[1.25rem_1fr] gap-x-1.5">
            <span
              aria-hidden="true"
              className="pt-1 text-label-md font-bold text-primary-strong"
            >
              {index + 1}.
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-headline-sm font-medium text-foreground">
                  {sense.ru.join(', ')}
                </span>
                {sense.primary && (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-label-sm text-primary-strong">
                    основное
                  </span>
                )}
              </div>
              {sense.en && <p className="text-body-sm text-muted-foreground">{sense.en}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
