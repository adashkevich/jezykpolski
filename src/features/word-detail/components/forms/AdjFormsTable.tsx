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
 * enumeration does, for SRS-scoping reasons unrelated to this display). Task 22
 * (`spec/tasks/22-adjectives-section.md`) moved the row-rendering part of that block into the
 * shared `DegreeComparisonBlock` (also used by `AdvFormsTable`), and added the gender-cell
 * merge below.
 *
 * Cell merge (task 22 step 2, acceptance "Совпадающие ячейки схлопываются"): Polish case
 * syncretism means several of the 5 concrete gender columns very often carry the *identical*
 * form for a given case/number (verified against real data — e.g. `absolutny|ADJ` plural
 * genitive/dative/instrumental/locative: all 5 genders show one form, because the underlying
 * paradigm slot is the `any` aggregate; plural nominative/accusative/vocative: 4 of the 5
 * match and only `masculine_personal` differs; singular accusative: `masculine_personal` and
 * `masculine_animate` match each other but NOT `masculine_inanimate` — the classic animacy
 * split, `masculine_animate_or_personal` in the source data). `mergeGenderCells` below groups
 * *adjacent* `GENDER_DISPLAY_ORDER` columns with identical rendered text into one `colSpan`
 * cell, which is exactly the syncretism pattern above: every one of those aggregates expands
 * to a contiguous run in `GENDER_DISPLAY_ORDER` (`masculine_personal, masculine_animate,
 * masculine_inanimate, feminine, neuter` — see `codec.ts`'s `ADJ_GENDER_AGGREGATE_EXPANSION`
 * doc comment), so a plain adjacent-run merge reproduces the source aggregate boundaries
 * without this component re-deriving them itself.
 */
import { useId, useState } from 'react'
import { buildAdjTable, getFormsForSlot } from '@/content/paradigms.ts'
import type { NumberValue } from '@/content/codec.ts'
import {
  CASE_LABELS,
  DEGREE_DISPLAY_ORDER,
  GENDER_DISPLAY_ORDER,
  GENDER_LABELS,
  type ConcreteGenderValue,
} from '@/learning/skills/dimensions.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { AdjTableRow } from '@/content/paradigms.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { cn } from '@/lib/utils'
import { DegreeComparisonBlock, type DegreeRow } from './DegreeComparisonBlock.tsx'
import {
  CELL_FORM_CLASS,
  SEGMENT_ITEM_ACTIVE_CLASS,
  SEGMENT_ITEM_CLASS,
  SEGMENT_TRACK_CLASS,
  TABLE_CLASS,
  TH_COL_CLASS,
  TH_ROW_CLASS,
  TR_CLASS,
} from './table-styles.ts'

function cellText(forms: readonly string[]): string {
  return forms.length > 0 ? forms.join(' / ') : '—'
}

interface MergedGenderCell {
  readonly text: string
  /** The concrete genders this cell stands for, in display order — used for the key and for
   *  the accessible column association below (`headers` lists every `<th>` id it spans). */
  readonly genders: readonly ConcreteGenderValue[]
}

/** Groups adjacent `GENDER_DISPLAY_ORDER` columns with identical `cellText` into one merged
 *  cell (see file header for why "adjacent" is enough to reproduce the real aggregate
 *  boundaries). Never merges non-adjacent columns, so e.g. singular accusative's
 *  masculine_personal/masculine_animate (same text) merge with each other but not with the
 *  differently-texted masculine_inanimate that sits right after them. */
function mergeGenderCells(row: AdjTableRow): MergedGenderCell[] {
  const cells: MergedGenderCell[] = []
  for (const gender of GENDER_DISPLAY_ORDER) {
    const text = cellText(row.forms[gender] ?? [])
    const last = cells[cells.length - 1]
    if (last && last.text === text) {
      cells[cells.length - 1] = { text, genders: [...last.genders, gender] }
    } else {
      cells.push({ text, genders: [gender] })
    }
  }
  return cells
}

export function AdjFormsTable({
  wordId,
  paradigm,
  skills,
}: {
  wordId: WordId
  paradigm: Paradigm
  skills: readonly SkillRecord[] | undefined
}) {
  const [number, setNumber] = useState<NumberValue>('singular')
  const table = buildAdjTable(paradigm, number)
  // Unique per rendered instance (`useId`, not a plain string literal) — two `AdjFormsTable`s
  // on the same page (unlikely today, but tests render more than one) must not collide on
  // `<th id>`, which the merged cells' `headers` attribute below references.
  const idPrefix = useId()

  const degreeRows: DegreeRow[] = DEGREE_DISPLAY_ORDER.map((degree) => ({
    degree,
    forms: getFormsForSlot(paradigm, `adj:degree:${degree}` as Dimension),
  })).filter((row) => row.forms.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Число" className={SEGMENT_TRACK_CLASS}>
        {(['singular', 'plural'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={number === option}
            onClick={() => setNumber(option)}
            className={cn(SEGMENT_ITEM_CLASS, number === option && SEGMENT_ITEM_ACTIVE_CLASS)}
          >
            {option === 'singular' ? 'Ед. число' : 'Мн. число'}
          </button>
        ))}
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className={cn(TABLE_CLASS, 'min-w-[640px]')}>
          <thead>
            <tr>
              <th scope="col" className={TH_COL_CLASS}>
                Падеж
              </th>
              {GENDER_DISPLAY_ORDER.map((gender) => (
                <th key={gender} id={`${idPrefix}-${gender}`} scope="col" className={TH_COL_CLASS}>
                  {GENDER_LABELS[gender].pl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.case} className={TR_CLASS}>
                <th
                  scope="row"
                  className={cn(TH_ROW_CLASS, 'text-label-md tracking-[0.04em] uppercase')}
                >
                  {CASE_LABELS[row.case].pl}
                </th>
                {mergeGenderCells(row).map((cell) => (
                  <td
                    key={cell.genders[0]}
                    colSpan={cell.genders.length}
                    headers={cell.genders.map((gender) => `${idPrefix}-${gender}`).join(' ')}
                    className={cn('px-3 py-2', CELL_FORM_CLASS)}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DegreeComparisonBlock rows={degreeRows} kind="adj" wordId={wordId} skills={skills} />
    </div>
  )
}
