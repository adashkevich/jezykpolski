/**
 * ADJ forms — case x gender, singular/plural toggle, degrees of comparison
 * (`spec/tasks/08-word-detail.md` §3, FR-45). `buildAdjTable` (task 04) already returns one
 * number's grid at a time, keyed by the 5 concrete declension genders in
 * `GENDER_DISPLAY_ORDER` — the toggle here just re-calls it with the other `NumberValue`,
 * no caching needed (it's a synchronous, already-decoded-in-memory computation).
 *
 * The degree block (positive/comparative/superlative — `dobry` / `lepszy` / `najlepszy`) is
 * NOT part of `buildAdjTable` (task 04 scoped that function to the case x gender grid only —
 * see that file's header): built here directly from `getFormsForSlot`, which the task 04
 * comparative/superlative dimension (`adj:degree:<degree>`) already matches for any degree
 * value including `positive` (`content/paradigms.ts`'s `matchesDimension` doesn't restrict
 * `adj:degree:*` to comparative/superlative — only `learning/skills/enumerate.ts`'s *skill*
 * enumeration does, for SRS-scoping reasons unrelated to this display).
 */
import { useState } from 'react'
import { buildAdjTable, getFormsForSlot } from '@/content/paradigms.ts'
import type { NumberValue } from '@/content/codec.ts'
import { CASE_LABELS, DEGREE_DISPLAY_ORDER, DEGREE_LABELS, GENDER_DISPLAY_ORDER, GENDER_LABELS } from '@/learning/skills/dimensions.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { Paradigm } from '@/types/content.ts'
import { cn } from '@/lib/utils'

function cellText(forms: readonly string[]): string {
  return forms.length > 0 ? forms.join(' / ') : '—'
}

export function AdjFormsTable({ paradigm }: { paradigm: Paradigm }) {
  const [number, setNumber] = useState<NumberValue>('singular')
  const table = buildAdjTable(paradigm, number)

  const degreeRows = DEGREE_DISPLAY_ORDER.map((degree) => ({
    degree,
    forms: getFormsForSlot(paradigm, `adj:degree:${degree}` as Dimension),
  })).filter((row) => row.forms.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Число" className="inline-flex w-fit rounded-lg border border-border p-0.5">
        {(['singular', 'plural'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={number === option}
            onClick={() => setNumber(option)}
            className={cn(
              'min-h-8 rounded-md px-3 text-sm font-medium transition-colors',
              number === option
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option === 'singular' ? 'Ед. число' : 'Мн. число'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Падеж
              </th>
              {GENDER_DISPLAY_ORDER.map((gender) => (
                <th key={gender} scope="col" className="py-1.5 pr-3 font-medium">
                  {GENDER_LABELS[gender].pl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.case} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                  {CASE_LABELS[row.case].pl}
                </th>
                {GENDER_DISPLAY_ORDER.map((gender) => (
                  <td key={gender} className="py-1.5 pr-3 text-foreground">
                    {cellText(row.forms[gender] ?? [])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {degreeRows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-sm font-medium text-foreground">Степени сравнения</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {degreeRows.map((row) => (
              <li key={row.degree} className="flex items-baseline gap-2">
                <span className="text-muted-foreground">{DEGREE_LABELS[row.degree].pl}:</span>
                <span className="text-foreground">{row.forms.join(' / ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
