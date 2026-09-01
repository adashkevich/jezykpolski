/**
 * ADV forms — degrees of comparison only (`spec/tasks/08-word-detail.md` §3, FR-05: "Раздел
 * Наречия ограничен степенями сравнения (в данных только `degree`)"). Same `adj:degree:*`-
 * style lookup as `AdjFormsTable`'s degree block, just the `adv:` namespace and no case/
 * gender grid above it — adverbs don't decline.
 */
import { getFormsForSlot } from '@/content/paradigms.ts'
import { DEGREE_DISPLAY_ORDER, DEGREE_LABELS } from '@/learning/skills/dimensions.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { Paradigm } from '@/types/content.ts'

export function AdvFormsTable({ paradigm }: { paradigm: Paradigm }) {
  const degreeRows = DEGREE_DISPLAY_ORDER.map((degree) => ({
    degree,
    forms: getFormsForSlot(paradigm, `adv:degree:${degree}` as Dimension),
  })).filter((row) => row.forms.length > 0)

  if (degreeRows.length === 0) {
    return <p className="text-sm text-muted-foreground">Для этого наречия нет форм сравнения.</p>
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {degreeRows.map((row) => (
        <li key={row.degree} className="flex items-baseline gap-2">
          <span className="text-muted-foreground">{DEGREE_LABELS[row.degree].pl}:</span>
          <span className="text-foreground">{row.forms.join(' / ')}</span>
        </li>
      ))}
    </ul>
  )
}
