/**
 * VERB forms — by tense/mood, person x number, past split by gender
 * (`spec/tasks/08-word-detail.md` §3, FR-44; tabs + pronouns + click-to-train added by task
 * 20, `spec/tasks/20-verbs-section.md` §2/§4). `buildVerbTable` (task 04, `content/
 * paradigms.ts`) returns four flat row lists (`present`/`future`/`imperative`/`past`); this
 * component pivots each into a person x number grid (and past additionally by gender) for
 * display — `buildVerbTable` itself deliberately stays a flat list (task 04's own design
 * choice, see that file's header), so the pivot lives here instead.
 *
 * Click-to-train (task 20's own scope decision — see this task's decision-log entry): a cell
 * with real forms is a `<button>` that shows this word's own skill state for that one
 * tense/mood x person x number(x gender) slot and, on click, launches a point training
 * session for exactly that skill — the exact mechanism `NounFormsTable.tsx` (task 17)
 * introduced (`navigate('/session', { state: { targetSkillIds: [skillId] } })`), just wired
 * up here for VERB dimensions too. No new session/materialization logic — this only
 * reconstructs the right `Dimension` string per cell (`verb:<tense>:<person>:<sg|pl>` for
 * present/future, `verb:imperative:<person>:<sg|pl>`, `verb:past:<person>:<sg|pl>:<gender>`)
 * and hands it to the same `encodeSkillId`/`navigate` pair `NounFormsTable` already uses.
 *
 * Analytic forms (the imperfective future, `będę robić`) are marked with a small "аналит."
 * tag on exactly the analytic form itself — `VerbConjugationRow.analyticForms` (task 20)
 * rather than the row-level `analytic` boolean, because a slot can hold both an analytic and
 * a non-analytic form at once (the 84 mixed-aspect verbs, e.g. `przypadać|VERB`'s
 * `verb:future:1:pl` slot: perfective `przypadamy` next to imperfective `będziemy
 * przypadać` — `matchesDimension` in `content/paradigms.ts` never filters on `aspect`, so
 * both already land in the same cell; badging the whole row would wrongly tag the
 * non-analytic one too). Both forms share the one `verb:future:1:pl` skill (same precedent
 * as NOUN's multi-form slots, e.g. `aborcji`/`aborcyj` — task 04) — clicking the cell trains
 * that one skill, `grade()` already accepts either literal answer for it.
 *
 * Tabs (task 20 §2 — "Вкладки по времени/наклонению"): a tab with zero rows for this verb is
 * simply not rendered, which is what covers the one real VERB paradigm (2498/2499) with no
 * imperative forms at all — "Повелительное" just doesn't appear as a tab, nothing crashes or
 * shows an empty grid. (In practice a handful of impersonal verbs, e.g. `zabraknąć|VERB`,
 * are missing whole tenses too — the same empty-tab-is-just-absent handling covers those for
 * free, not only the imperative case the task text calls out.)
 */
import { useMemo, useState } from 'react'
import { Tabs } from 'radix-ui'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { buildVerbTable, type VerbConjugationRow } from '@/content/paradigms.ts'
import { MASTERED_THRESHOLD, skillMaturity } from '@/learning/progress/aggregate.ts'
import {
  abbreviateNumber,
  GENDER_LABELS,
  PERSON_DISPLAY_ORDER,
  type Dimension,
} from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import { cn } from '@/lib/utils'
import type { GenderValue, NumberValue } from '@/content/codec.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

/**
 * Pronouns, not digits (task 20 §4/acceptance: "Лица подписаны местоимениями"; app-design.md
 * §12's own list: "ja / ty / on/ona/ono / my / wy / oni/one"). `PersonNumberGrid`'s rows are
 * one row per person spanning BOTH the singular and plural columns (so, e.g., person 1's one
 * row covers both "ja" and "my" forms) — the row header shows both pronouns for that reason.
 * `on · ona · ono` (singular 3rd person) is not further split by gender here: `present`/
 * `future`/`imperative` never mark gender in the data at all, only `past` does (that table
 * pivots by gender separately below, per task text: "местоимение уже неявно ясно из
 * gender-колонки").
 */
const PERSON_PRONOUNS: Readonly<
  Record<(typeof PERSON_DISPLAY_ORDER)[number], { readonly sg: string; readonly pl: string }>
> = {
  1: { sg: 'ja', pl: 'my' },
  2: { sg: 'ty', pl: 'wy' },
  3: { sg: 'on · ona · ono', pl: 'oni · one' },
}

function personRowLabel(person: (typeof PERSON_DISPLAY_ORDER)[number]): string {
  const { sg, pl } = PERSON_PRONOUNS[person]
  return `${sg} / ${pl}`
}

function cellText(forms: readonly string[]): string {
  return forms.join(' / ')
}

/** Same "новое / X% / ✓" convention `NounFormsTable.tsx`'s `cellStateLabel` uses — one VERB
 *  slot (tense/mood x person x number[x gender]) maps 1:1 to one skill, same as a NOUN slot. */
function cellStateLabel(skill: SkillRecord | undefined): string {
  const maturity = skillMaturity(skill)
  if (skill === undefined || maturity <= 0) return 'новое'
  if (maturity >= MASTERED_THRESHOLD) return '✓'
  return `${Math.round(maturity * 100)}%`
}

function FormsWithAnalyticMarkers({ row }: { row: VerbConjugationRow }) {
  return (
    <>
      {row.forms.map((form, i) => (
        <span key={form}>
          {i > 0 && ' / '}
          {form}
          {row.analyticForms.includes(form) && (
            <span
              title="Аналитическая форма (będę + инфинитив)"
              className="ml-1 inline-block rounded bg-muted px-1 align-middle text-[0.65rem] font-medium text-muted-foreground"
            >
              аналит.
            </span>
          )}
        </span>
      ))}
    </>
  )
}

function VerbFormsCell({
  row,
  wordId,
  dimension,
  known,
  onTrain,
  ariaLabel,
}: {
  row: VerbConjugationRow | undefined
  wordId: WordId
  dimension: Dimension
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
  ariaLabel: string
}) {
  if (!row || row.forms.length === 0) {
    return <td className="py-1.5 pr-3 text-muted-foreground">—</td>
  }

  const skillId = encodeSkillId(wordId, dimension)
  const skill = known.get(skillId)
  const stateLabel = cellStateLabel(skill)

  return (
    <td className="p-0">
      <button
        type="button"
        onClick={() => onTrain(skillId)}
        aria-label={`${ariaLabel}: ${cellText(row.forms)} — ${stateLabel}. Тренировать.`}
        className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <span className="text-foreground">
          <FormsWithAnalyticMarkers row={row} />
        </span>
        <span aria-hidden="true" className="text-[10px] leading-none text-muted-foreground">
          {stateLabel}
        </span>
      </button>
    </td>
  )
}

/** `present`/`future` share one dimension shape (`verb:<tense>:<person>:<sg|pl>`);
 *  `imperative` swaps in its own mood keyword instead of a tense. Mirrors `buildVerbTable`'s
 *  own `makeDimension` closures in `content/paradigms.ts` exactly, so a cell's skillId always
 *  matches the dimension `getFormsForSlot` used to populate it. */
type PersonNumberTabKind = 'present' | 'future' | 'imperative'

function personNumberDimension(
  kind: PersonNumberTabKind,
  person: (typeof PERSON_DISPLAY_ORDER)[number],
  number: NumberValue,
): Dimension {
  const numberAbbrev = abbreviateNumber(number)
  return kind === 'imperative'
    ? `verb:imperative:${person}:${numberAbbrev}`
    : `verb:${kind}:${person}:${numberAbbrev}`
}

function PersonNumberGrid({
  kind,
  tabLabel,
  rows,
  wordId,
  known,
  onTrain,
}: {
  kind: PersonNumberTabKind
  tabLabel: string
  rows: readonly VerbConjugationRow[]
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
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
                  {personRowLabel(person)}
                </th>
                <VerbFormsCell
                  row={cells.singular}
                  wordId={wordId}
                  dimension={personNumberDimension(kind, person, 'singular')}
                  known={known}
                  onTrain={onTrain}
                  ariaLabel={`${tabLabel}, ${PERSON_PRONOUNS[person].sg}, liczba pojedyncza`}
                />
                <VerbFormsCell
                  row={cells.plural}
                  wordId={wordId}
                  dimension={personNumberDimension(kind, person, 'plural')}
                  known={known}
                  onTrain={onTrain}
                  ariaLabel={`${tabLabel}, ${PERSON_PRONOUNS[person].pl}, liczba mnoga`}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
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

function PastTenseTable({
  rows,
  wordId,
  known,
  onTrain,
}: {
  rows: readonly VerbConjugationRow[]
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  const cell = (
    person: (typeof PERSON_DISPLAY_ORDER)[number],
    number: NumberValue,
    gender: GenderValue,
  ) => rows.find((r) => r.person === person && r.number === number && r.gender === gender)

  return (
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
                  {personRowLabel(person)}
                </th>
                {cells.map((c, i) => {
                  const col = PAST_COLUMNS[i]!
                  const numberAbbrev = abbreviateNumber(col.number)
                  return (
                    <VerbFormsCell
                      key={`${col.number}-${col.gender}`}
                      row={c}
                      wordId={wordId}
                      dimension={`verb:past:${person}:${numberAbbrev}:${col.gender}`}
                      known={known}
                      onTrain={onTrain}
                      ariaLabel={`Czas przeszły, ${personRowLabel(person)}, ${GENDER_LABELS[col.gender].pl}`}
                    />
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const TAB_TRIGGER_CLASS =
  'min-h-11 shrink-0 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground'

export function VerbFormsTable({
  wordId,
  paradigm,
  skills,
}: {
  wordId: WordId
  paradigm: Paradigm
  /** Every `SkillRecord` this word currently has (any kind, not just `verb:*`) — mirrors
   *  `NounFormsTable`'s own `skills` prop shape. */
  skills: readonly SkillRecord[] | undefined
}) {
  const navigate = useNavigate()
  const table = useMemo(() => buildVerbTable(paradigm), [paradigm])
  const known = useMemo<ReadonlyMap<SkillId, SkillRecord>>(
    () => new Map((skills ?? []).map((s) => [s.skillId, s])),
    [skills],
  )

  function handleTrain(skillId: SkillId) {
    navigate('/session', { state: { targetSkillIds: [skillId] } })
  }

  const tabs = useMemo(
    () =>
      (
        [
          { key: 'present' as const, label: 'Настоящее время', rows: table.present },
          { key: 'future' as const, label: 'Будущее время', rows: table.future },
          { key: 'imperative' as const, label: 'Повелительное наклонение', rows: table.imperative },
          { key: 'past' as const, label: 'Прошедшее время', rows: table.past },
        ] as const
      ).filter((tab) => tab.rows.length > 0),
    [table],
  )

  const [value, setValue] = useState(() => tabs[0]?.key)

  if (tabs.length === 0) {
    return <p className="text-sm text-muted-foreground">У этого глагола нет форм спряжения.</p>
  }

  // Guards against a stale `value` from a previous paradigm (e.g. navigating between two
  // word-detail pages without unmounting this component) pointing at a tab this verb doesn't
  // have — falls back to the first available tab rather than rendering nothing.
  const activeValue = value !== undefined && tabs.some((t) => t.key === value) ? value : tabs[0]!.key

  return (
    <Tabs.Root
      value={activeValue}
      onValueChange={(v) => setValue(v as (typeof tabs)[number]['key'])}
    >
      <Tabs.List
        aria-label="Время и наклонение"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab.key} value={tab.key} className={cn(TAB_TRIGGER_CLASS)}>
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content key={tab.key} value={tab.key} className="flex flex-col gap-3 pt-3">
          {tab.key === 'past' ? (
            <PastTenseTable rows={tab.rows} wordId={wordId} known={known} onTrain={handleTrain} />
          ) : (
            <PersonNumberGrid
              kind={tab.key}
              tabLabel={tab.label}
              rows={tab.rows}
              wordId={wordId}
              known={known}
              onTrain={handleTrain}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(`/practice/verb-table/${encodeURIComponent(wordId)}/${tab.key}`)}
            className="min-h-11 self-start"
          >
            Тренировать таблицей
          </Button>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}
