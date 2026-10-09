/**
 * "Значения" — `spec/tasks/08-word-detail.md` §2, FR-41: every sense listed, primary first
 * (already the order `content/senses.ts#getSenses` returns them in — this component doesn't
 * re-sort), Russian translations only. The v2 dictionary has no English gloss any more (task
 * 47); its Polish gloss and example come with task 50's redesign of this list.
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
      <h2 className="sr-only">Значения</h2>
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
              <span className="text-headline-sm font-medium text-foreground">
                {sense.ru.join(', ')}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
