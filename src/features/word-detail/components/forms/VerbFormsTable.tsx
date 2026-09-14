/**
 * VERB forms — restyled to match `spec/design/word-verb.png`: a segmented switch over
 * TENSE only (Настоящее / Будущее / Прошедшее — mood is not a tab), each tense rendering a
 * flat "Лицо / Форма" list (singular block ja/ty/on·ona·ono, then plural block my/wy/oni·one
 * — `content/paradigms.ts`'s own `buildVerbTable` groups by person first, so `orderedRows`
 * below re-groups by number instead). The imperative mood has no tab of its own: the design
 * shows it as a second, always-visible "Повелительное наклонение" list underneath whichever
 * tense tab is active, so it's rendered unconditionally alongside `Tabs.Root` rather than as
 * one more `Tabs.Content`.
 *
 * `buildVerbTable` (task 04, `content/paradigms.ts`) returns four flat row lists (`present`/
 * `future`/`imperative`/`past`); this component decides ordering/grouping for display, the
 * same division of labour the previous (grid) version used.
 *
 * Ending highlight (`spec/design/word-verb.png`: `licz` in the base color, `ę`/`ysz`/`ymy`/…
 * highlighted) reuses `form-ending.ts`'s `paradigmStem`/`splitEnding` — the same utility
 * `NounFormsTable.tsx` introduced for the declension list, generic over any single inflected
 * word, not noun-specific. One stem is computed from every form across all four tables so the
 * highlighted boundary never shifts when switching tabs.
 *
 * Click-to-train (task 20's own scope decision — see this task's decision-log entry): a cell
 * with real forms is a `<button>` that, on click, launches a point training session for
 * exactly that tense/mood x person x number(x gender) skill — the exact mechanism
 * `NounFormsTable.tsx` (task 17) introduced (`navigate('/session', { state: { targetSkillIds:
 * [skillId] } })`), wired up here for VERB dimensions too. No new session/materialization
 * logic — this only reconstructs the right `Dimension` string per cell (`verb:<tense>:
 * <person>:<sg|pl>` for present/future, `verb:imperative:<person>:<sg|pl>`, `verb:past:
 * <person>:<sg|pl>:<gender>`) and hands it to the same `encodeSkillId`/`navigate` pair
 * `NounFormsTable` already uses. A cell's caption is only ever "✓" once mastered (matching
 * `NounFormsTable`'s own `cellStateLabel` — no "новое"/percentage clutter on the list).
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
 * Tabs: a tense with zero rows for this verb is simply not rendered, which is what covers the
 * one real VERB paradigm (2498/2499) with no imperative forms at all — the "Повелительное
 * наклонение" block just doesn't appear, nothing crashes or shows an empty list. (In practice
 * a handful of impersonal verbs, e.g. `zabraknąć|VERB`, are missing whole tenses too — the
 * same empty-block-is-just-absent handling covers those for free.)
 *
 * Past tense (`PastFormsList` below) renders one badge + form block per person x number
 * (`PastPersonBlock`) instead of the wide case-x-gender-style grid the other tenses would
 * need for their 5 gender slots — `spec/design/word-adjective.png`'s per-case sections
 * established that "small badge, one row per variant" pattern for exactly this problem
 * (several grammatical variants sharing one slot), so past tense reuses it rather than a
 * bespoke grid of its own.
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
  NUMBER_DISPLAY_ORDER,
  PERSON_DISPLAY_ORDER,
  type Dimension,
} from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import { cn } from '@/lib/utils'
import type { NumberValue } from '@/content/codec.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { paradigmStem, splitEnding } from './form-ending.ts'
import {
  CELL_BUTTON_CLASS,
  CELL_EMPTY_CLASS,
  CELL_FORM_CLASS,
  CELL_STATE_CLASS,
  GENDER_BLOCK_BADGE_CLASS,
  GENDER_BLOCK_CLASS,
  GENDER_BLOCK_HEADER_CLASS,
  GENDER_BLOCK_LIST_CLASS,
  GENDER_BLOCK_ROW_CLASS,
  SEGMENT_ITEM_CLASS,
  SEGMENT_TRACK_CLASS,
  TABLE_CLASS,
  TH_COL_CLASS,
  TH_ROW_CLASS,
  TR_CLASS,
} from './table-styles.ts'

/** The ending highlight itself has no declension-specific meaning, but reuses the exact same
 *  visual treatment `word-noun.png`'s declension list established — one shared "this is the
 *  part that changes" convention across both tables. */
const ENDING_CLASS = 'text-primary-strong'

/** Pronouns, not digits (task 20 §4/acceptance: "Лица подписаны местоимениями"; app-design.md
 *  §12's own list: "ja / ty / on/ona/ono / my / wy / oni/one"). `on · ona · ono` (singular
 *  3rd person) is not further split by gender here: `present`/`future`/`imperative` never
 *  mark gender in the data at all, only `past` does (that table pivots by gender separately
 *  below, per task text: "местоимение уже неявно ясно из gender-колонки"). */
const PERSON_PRONOUNS: Readonly<
  Record<(typeof PERSON_DISPLAY_ORDER)[number], { readonly sg: string; readonly pl: string }>
> = {
  1: { sg: 'ja', pl: 'my' },
  2: { sg: 'ty', pl: 'wy' },
  3: { sg: 'on · ona · ono', pl: 'oni · one' },
}

function personLabel(person: (typeof PERSON_DISPLAY_ORDER)[number], number: NumberValue): string {
  return PERSON_PRONOUNS[person][number === 'singular' ? 'sg' : 'pl']
}

function cellText(forms: readonly string[]): string {
  return forms.join(' / ')
}

/** Only a mastered slot gets a caption ("✓"); an unmastered or not-yet-attempted slot shows
 *  nothing — same convention `NounFormsTable.tsx`'s `cellStateLabel` uses, no "новое"/
 *  percentage clutter on the list. */
function cellStateLabel(skill: SkillRecord | undefined): string {
  return skillMaturity(skill) >= MASTERED_THRESHOLD ? '✓' : ''
}

/** Renders `row.forms`, each split into stem/ending independently (the " / " separator
 *  between multi-form slots is never itself highlighted), plus the small "аналит." badge on
 *  whichever forms `row.analyticForms` marks. */
function FormsWithMarkers({ row, stem }: { row: VerbConjugationRow; stem: string }) {
  return (
    <>
      {row.forms.map((form, i) => {
        const [head, ending] = splitEnding(form, stem)
        return (
          <span key={form}>
            {i > 0 && ' / '}
            {head}
            {ending && <span className={ENDING_CLASS}>{ending}</span>}
            {row.analyticForms.includes(form) && (
              <span
                title="Аналитическая форма (będę + инфинитив)"
                className="ml-1 inline-block rounded bg-secondary px-1 align-middle text-[0.65rem] font-medium text-muted-foreground"
              >
                аналит.
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}

function VerbFormsCell({
  row,
  stem,
  wordId,
  dimension,
  known,
  onTrain,
  ariaLabel,
}: {
  row: VerbConjugationRow | undefined
  stem: string
  wordId: WordId
  dimension: Dimension
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
  ariaLabel: string
}) {
  if (!row || row.forms.length === 0) {
    return <td className={CELL_EMPTY_CLASS}>—</td>
  }

  const skillId = encodeSkillId(wordId, dimension)
  const skill = known.get(skillId)
  const stateLabel = cellStateLabel(skill)

  return (
    <td className="p-0">
      <button
        type="button"
        onClick={() => onTrain(skillId)}
        aria-label={`${ariaLabel}: ${cellText(row.forms)}${stateLabel ? ` — ${stateLabel}` : ''}. Тренировать.`}
        className={CELL_BUTTON_CLASS}
      >
        <span className={CELL_FORM_CLASS}>
          <FormsWithMarkers row={row} stem={stem} />
        </span>
        {stateLabel && (
          <span aria-hidden="true" className={CELL_STATE_CLASS}>
            {stateLabel}
          </span>
        )}
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

/** Re-groups `buildVerbTable`'s person-outer rows into number-outer order (singular block —
 *  ja/ty/on·ona·ono — then plural block — my/wy/oni·one), matching the design's row order. A
 *  person missing from `rows` (e.g. an impersonal verb) is simply skipped, not shown empty. */
function orderedRows(rows: readonly VerbConjugationRow[]): readonly VerbConjugationRow[] {
  return NUMBER_DISPLAY_ORDER.flatMap((number) =>
    PERSON_DISPLAY_ORDER.map((person) =>
      rows.find((r) => r.person === person && r.number === number),
    ).filter((r): r is VerbConjugationRow => r !== undefined),
  )
}

function PersonFormList({
  kind,
  tabLabel,
  rows,
  stem,
  wordId,
  known,
  onTrain,
}: {
  kind: PersonNumberTabKind
  tabLabel: string
  rows: readonly VerbConjugationRow[]
  stem: string
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  const rowsInOrder = orderedRows(rows)

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={cn(TABLE_CLASS, 'min-w-[260px]')}>
        <thead>
          <tr>
            <th scope="col" className={TH_COL_CLASS}>
              Лицо
            </th>
            <th scope="col" className={TH_COL_CLASS}>
              Форма
            </th>
          </tr>
        </thead>
        <tbody>
          {rowsInOrder.map((row) => (
            <tr key={`${row.number}-${row.person}`} className={TR_CLASS}>
              <th
                scope="row"
                className={cn(
                  TH_ROW_CLASS,
                  row.person === 1 ? 'text-primary-strong' : 'text-muted-foreground',
                )}
              >
                {personLabel(row.person, row.number)}
              </th>
              <VerbFormsCell
                row={row}
                stem={stem}
                wordId={wordId}
                dimension={personNumberDimension(kind, row.person, row.number)}
                known={known}
                onTrain={onTrain}
                ariaLabel={`${tabLabel}, ${personLabel(row.person, row.number)}`}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Past tense's real gender split (`content/paradigms.ts`'s `PAST_GENDERS_BY_NUMBER`,
 *  verified against real data): singular masculine/feminine/neuter, plural
 *  masculine_personal/non_masculine_personal — 5 slots total, not the 5-way ADJ breakdown.
 *  Narrowed to exactly these 5 literals (rather than the full `GenderValue` union) so
 *  `PAST_GENDER_BADGE` below can't accidentally omit one. */
type PastGender =
  'masculine' | 'feminine' | 'neuter' | 'masculine_personal' | 'non_masculine_personal'

const PAST_GENDERS_BY_NUMBER: Readonly<Record<NumberValue, readonly PastGender[]>> = {
  singular: ['masculine', 'feminine', 'neuter'],
  plural: ['masculine_personal', 'non_masculine_personal'],
}

/** Short badge text for each past-tense gender — the small "М / Ж / СР" pills
 *  `spec/design/word-adjective.png`'s per-case blocks use, one row per gender instead of one
 *  column per gender (the previous grid didn't read well at phone width either). The full
 *  bilingual `GENDER_LABELS` phrase is still used for the row's accessible name below. */
const PAST_GENDER_BADGE: Readonly<Record<PastGender, string>> = {
  masculine: 'М',
  feminine: 'Ж',
  neuter: 'СР',
  masculine_personal: 'Мужск.',
  non_masculine_personal: 'Немужск.',
}

function PastGenderRow({
  person,
  number,
  gender,
  row,
  stem,
  wordId,
  known,
  onTrain,
}: {
  person: (typeof PERSON_DISPLAY_ORDER)[number]
  number: NumberValue
  gender: PastGender
  row: VerbConjugationRow
  stem: string
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  const dimension: Dimension = `verb:past:${person}:${abbreviateNumber(number)}:${gender}`
  const skillId = encodeSkillId(wordId, dimension)
  const skill = known.get(skillId)
  const stateLabel = cellStateLabel(skill)
  const ariaLabel = `Czas przeszły, ${personLabel(person, number)}, ${GENDER_LABELS[gender].pl}`

  return (
    <button
      type="button"
      onClick={() => onTrain(skillId)}
      aria-label={`${ariaLabel}: ${cellText(row.forms)}${stateLabel ? ` — ${stateLabel}` : ''}. Тренировать.`}
      className={GENDER_BLOCK_ROW_CLASS}
    >
      <span className={GENDER_BLOCK_BADGE_CLASS}>{PAST_GENDER_BADGE[gender]}</span>
      <span className={CELL_FORM_CLASS}>
        <FormsWithMarkers row={row} stem={stem} />
      </span>
      {stateLabel && (
        <span aria-hidden="true" className={CELL_STATE_CLASS}>
          {stateLabel}
        </span>
      )}
    </button>
  )
}

/** One block per person x number — a header (the pronoun) plus one row per gender variant
 *  that actually exists in this verb's data; a gender the paradigm never fills for that
 *  person (e.g. "ja" never carrying a neuter form) is skipped rather than shown as an empty
 *  row, same "missing slot = absent, not a dash" convention `orderedRows` above uses. */
function PastPersonBlock({
  person,
  number,
  rows,
  stem,
  wordId,
  known,
  onTrain,
}: {
  person: (typeof PERSON_DISPLAY_ORDER)[number]
  number: NumberValue
  rows: readonly VerbConjugationRow[]
  stem: string
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  const genderRows = PAST_GENDERS_BY_NUMBER[number]
    .map((gender) => ({
      gender,
      row: rows.find((r) => r.person === person && r.number === number && r.gender === gender),
    }))
    .filter((g): g is { gender: PastGender; row: VerbConjugationRow } => g.row !== undefined)

  if (genderRows.length === 0) return null

  return (
    <div className={GENDER_BLOCK_CLASS}>
      <span
        className={cn(
          GENDER_BLOCK_HEADER_CLASS,
          person === 1 ? 'text-primary-strong' : 'text-muted-foreground',
        )}
      >
        {personLabel(person, number)}
      </span>
      {genderRows.map(({ gender, row }) => (
        <PastGenderRow
          key={gender}
          person={person}
          number={number}
          gender={gender}
          row={row}
          stem={stem}
          wordId={wordId}
          known={known}
          onTrain={onTrain}
        />
      ))}
    </div>
  )
}

/** Replaces the old case x gender grid (`spec/design/word-verb.png` shows only present/
 *  future/imperative, so past had no mockup of its own until now) with the badge + form
 *  block list `spec/design/word-adjective.png`'s per-case sections use — one block per
 *  person x number, singular block first then plural (same order `orderedRows` above uses
 *  for present/future/imperative). */
function PastFormsList({
  rows,
  stem,
  wordId,
  known,
  onTrain,
}: {
  rows: readonly VerbConjugationRow[]
  stem: string
  wordId: WordId
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  return (
    <div className={GENDER_BLOCK_LIST_CLASS}>
      {NUMBER_DISPLAY_ORDER.flatMap((number) =>
        PERSON_DISPLAY_ORDER.map((person) => (
          <PastPersonBlock
            key={`${number}-${person}`}
            person={person}
            number={number}
            rows={rows}
            stem={stem}
            wordId={wordId}
            known={known}
            onTrain={onTrain}
          />
        )),
      )}
    </div>
  )
}

// Segmented control (DESIGN.md §2) rather than underlined tabs — radix drives the active
// state through `data-state`, so the shared active classes are applied via that attribute.
const TAB_TRIGGER_CLASS = cn(
  SEGMENT_ITEM_CLASS,
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-cta',
)

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

  // One stem for the whole word, from every form across all four tables, so the highlighted
  // ending boundary never shifts when switching tense tabs.
  const stem = useMemo(() => {
    const allForms = [
      ...table.present,
      ...table.future,
      ...table.imperative,
      ...table.past,
    ].flatMap((row) => row.forms)
    return paradigmStem(allForms)
  }, [table])

  function handleTrain(skillId: SkillId) {
    navigate('/session', { state: { targetSkillIds: [skillId] } })
  }

  const tenseTabs = useMemo(
    () =>
      (
        [
          { key: 'present' as const, label: 'Настоящее', rows: table.present },
          { key: 'future' as const, label: 'Будущее', rows: table.future },
          { key: 'past' as const, label: 'Прошедшее', rows: table.past },
        ] as const
      ).filter((tab) => tab.rows.length > 0),
    [table],
  )
  const hasImperative = table.imperative.length > 0

  const [value, setValue] = useState(() => tenseTabs[0]?.key)

  if (tenseTabs.length === 0 && !hasImperative) {
    return <p className="text-sm text-muted-foreground">У этого глагола нет форм спряжения.</p>
  }

  // Guards against a stale `value` from a previous paradigm (e.g. navigating between two
  // word-detail pages without unmounting this component) pointing at a tab this verb doesn't
  // have — falls back to the first available tab rather than rendering nothing.
  const activeValue =
    value !== undefined && tenseTabs.some((t) => t.key === value) ? value : tenseTabs[0]?.key

  return (
    <div className="flex flex-col gap-4">
      {tenseTabs.length > 0 && activeValue !== undefined && (
        <Tabs.Root
          value={activeValue}
          onValueChange={(v) => setValue(v as (typeof tenseTabs)[number]['key'])}
        >
          <Tabs.List
            aria-label="Время"
            className={cn(
              SEGMENT_TRACK_CLASS,
              '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {tenseTabs.map((tab) => (
              <Tabs.Trigger key={tab.key} value={tab.key} className={TAB_TRIGGER_CLASS}>
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {tenseTabs.map((tab) => (
            <Tabs.Content key={tab.key} value={tab.key} className="flex flex-col gap-4 pt-3">
              {tab.key === 'past' ? (
                <PastFormsList
                  rows={tab.rows}
                  stem={stem}
                  wordId={wordId}
                  known={known}
                  onTrain={handleTrain}
                />
              ) : (
                <PersonFormList
                  kind={tab.key}
                  tabLabel={tab.label}
                  rows={tab.rows}
                  stem={stem}
                  wordId={wordId}
                  known={known}
                  onTrain={handleTrain}
                />
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(`/practice/verb-table/${encodeURIComponent(wordId)}/${tab.key}`)
                }
                className="min-h-11 self-start"
              >
                Тренировать таблицей
              </Button>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      )}

      {hasImperative && (
        <div className="flex flex-col gap-4">
          {tenseTabs.length > 0 && <div className="border-t border-border" />}
          <h3 className="font-heading text-headline-sm text-foreground">
            Повелительное наклонение
          </h3>
          <PersonFormList
            kind="imperative"
            tabLabel="Повелительное наклонение"
            rows={table.imperative}
            stem={stem}
            wordId={wordId}
            known={known}
            onTrain={handleTrain}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate(`/practice/verb-table/${encodeURIComponent(wordId)}/imperative`)
            }
            className="min-h-11 self-start"
          >
            Тренировать таблицей
          </Button>
        </div>
      )}
    </div>
  )
}
