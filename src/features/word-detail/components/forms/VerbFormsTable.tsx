/**
 * VERB forms — by tense/mood, person x number, past split by gender
 * (`spec/tasks/08-word-detail.md` §3, FR-44). `buildVerbTable` (task 04, `content/
 * paradigms.ts`) returns four flat row lists (`present`/`future`/`imperative`/`past`); this
 * component pivots each into a person x number grid (and past additionally by gender) for
 * display — `buildVerbTable` itself deliberately stays a flat list (task 04's own design
 * choice, see that file's header), so the pivot lives here instead.
 *
 * Analytic forms (the imperfective future, `będę robić`) are marked with a small "аналит."
 * tag — `VerbConjugationRow.analytic` (added by this task, see `content/paradigms.ts`'s
 * updated header) is exactly the bit that makes this possible without re-deriving it from
 * raw `DecodedForm`s here.
 */
import { buildVerbTable, type VerbConjugationRow } from '@/content/paradigms.ts'
import type { GenderValue, NumberValue } from '@/content/codec.ts'
import { GENDER_LABELS, PERSON_DISPLAY_ORDER } from '@/learning/skills/dimensions.ts'
import type { Paradigm } from '@/types/content.ts'

const PERSON_LABEL: Readonly<Record<(typeof PERSON_DISPLAY_ORDER)[number], string>> = {
  1: '1 л.',
  2: '2 л.',
  3: '3 л.',
}

function Cell({ row }: { row: VerbConjugationRow | undefined }) {
  if (!row) return <>—</>
  return (
    <>
      {row.forms.join(' / ')}
      {row.analytic && (
        <span
          title="Аналитическая форма (będę + инфинитив)"
          className="ml-1.5 inline-block rounded bg-muted px-1 align-middle text-[0.65rem] font-medium text-muted-foreground"
        >
          аналит.
        </span>
      )}
    </>
  )
}

function PersonNumberGrid({ title, rows }: { title: string; rows: readonly VerbConjugationRow[] }) {
  if (rows.length === 0) return null

  const byPerson = new Map<
    (typeof PERSON_DISPLAY_ORDER)[number],
    Partial<Record<NumberValue, VerbConjugationRow>>
  >()
  for (const row of rows) {
    const forPerson = byPerson.get(row.person) ?? {}
    forPerson[row.number] = row
    byPerson.set(row.person, forPerson)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Лицо
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
            {PERSON_DISPLAY_ORDER.filter((p) => byPerson.has(p)).map((person) => {
              const cells = byPerson.get(person)!
              return (
                <tr key={person} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                    {PERSON_LABEL[person]}
                  </th>
                  <td className="py-1.5 pr-3 text-foreground">
                    <Cell row={cells.singular} />
                  </td>
                  <td className="py-1.5 text-foreground">
                    <Cell row={cells.plural} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Past tense's real gender split (`content/paradigms.ts`'s `PAST_GENDERS_BY_NUMBER`,
 *  verified against real data): singular masculine/feminine/neuter, plural
 *  masculine_personal/non_masculine_personal — 5 columns, not the 5-way ADJ breakdown. */
const PAST_COLUMNS: ReadonlyArray<{ number: NumberValue; gender: GenderValue }> = [
  { number: 'singular', gender: 'masculine' },
  { number: 'singular', gender: 'feminine' },
  { number: 'singular', gender: 'neuter' },
  { number: 'plural', gender: 'masculine_personal' },
  { number: 'plural', gender: 'non_masculine_personal' },
]

function PastTenseTable({ rows }: { rows: readonly VerbConjugationRow[] }) {
  if (rows.length === 0) return null

  const cell = (person: (typeof PERSON_DISPLAY_ORDER)[number], number: NumberValue, gender: GenderValue) =>
    rows.find((r) => r.person === person && r.number === number && r.gender === gender)

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium text-foreground">Прошедшее время</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Лицо
              </th>
              {PAST_COLUMNS.map((col) => (
                <th key={`${col.number}-${col.gender}`} scope="col" className="py-1.5 pr-3 font-medium">
                  {GENDER_LABELS[col.gender].pl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERSON_DISPLAY_ORDER.map((person) => {
              const cells = PAST_COLUMNS.map((col) => cell(person, col.number, col.gender))
              if (cells.every((c) => c === undefined)) return null
              return (
                <tr key={person} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                    {PERSON_LABEL[person]}
                  </th>
                  {cells.map((c, i) => (
                    <td key={i} className="py-1.5 pr-3 text-foreground">
                      <Cell row={c} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function VerbFormsTable({ paradigm }: { paradigm: Paradigm }) {
  const table = buildVerbTable(paradigm)

  return (
    <div className="flex flex-col gap-4">
      <PersonNumberGrid title="Настоящее время" rows={table.present} />
      <PersonNumberGrid title="Будущее время" rows={table.future} />
      <PersonNumberGrid title="Повелительное наклонение" rows={table.imperative} />
      <PastTenseTable rows={table.past} />
    </div>
  )
}
