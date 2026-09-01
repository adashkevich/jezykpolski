/**
 * NOUN forms — case x number (`spec/tasks/08-word-detail.md` §3, FR-43). `buildNounTable`
 * (task 04, `content/paradigms.ts`) already returns the 7 rows in canonical case order
 * (M. D. C. B. N. Ms. W.) with singular/plural forms side by side — this component is pure
 * rendering, no reordering or re-grouping of its own.
 *
 * A slot with more than one valid form (e.g. `aborcji` / `aborcyj`, task 04's own example)
 * shows both, joined by " / " — `buildNounTable`'s `singular`/`plural` are already
 * de-duplicated arrays for exactly this reason.
 *
 * Horizontally scrollable (`overflow-x-auto` on the table's own wrapper, `min-w` on the
 * `<table>` itself) so a 320px viewport scrolls the table, never the page (acceptance
 * point 10) — same technique every table in this feature uses.
 */
import { buildNounTable } from '@/content/paradigms.ts'
import { CASE_LABELS } from '@/learning/skills/dimensions.ts'
import type { Paradigm } from '@/types/content.ts'

function cellText(forms: readonly string[]): string {
  return forms.length > 0 ? forms.join(' / ') : '—'
}

export function NounFormsTable({ paradigm }: { paradigm: Paradigm }) {
  const table = buildNounTable(paradigm)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Падеж
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Ед. число
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Мн. число
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.case} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                {CASE_LABELS[row.case].pl}
                <span className="block text-xs font-normal text-muted-foreground">
                  {CASE_LABELS[row.case].ru}
                </span>
              </th>
              <td className="py-1.5 pr-3 text-foreground">{cellText(row.singular)}</td>
              <td className="py-1.5 text-foreground">{cellText(row.plural)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
