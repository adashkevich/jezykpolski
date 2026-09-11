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
 *
 * Task 17 (`spec/tasks/17-nouns-section.md` §4) adds clickability: a slot with real forms is
 * a `<button>`, not bare text — it shows this word's own skill state for that one
 * case/number cell (not the case-level average `ProgressSection`'s breakdown shows) and, on
 * click, launches a point training session for exactly that one skill
 * (`navigate('/session', { state: { targetSkillIds: [skillId] } })` — deliberately a
 * different router-state key than `SessionResultPage`'s `{ skillIds }`, which
 * `session-scope.ts` maps to the mistakes mode this click must NOT trigger; see that file's
 * header for why). An empty slot ("—", no forms in the paradigm at all) stays plain text —
 * there is no `SkillDescriptor` for a dimension `enumerateSkills` never produced, so
 * `materializeQueueItem` would have nothing to resolve if it were clickable (task 03's own
 * rule: skills only for slots that actually exist).
 *
 * Wołacz (the last row, `case: 'vocative'`) is rendered and clickable exactly like every
 * other case — task 17 §6's "по умолчанию исключён из тренировки" is a queue-building
 * concern (`learning/skills/training-defaults.ts`, read by tasks 18/19), not a table-display
 * one: "доступен в таблице и включаем вручную" is precisely this table staying fully live.
 *
 * Task 18 (`spec/tasks/18-noun-exercises.md` step 4, FR-62) adds the "Тренировать таблицей"
 * button below the table — a SEPARATE entry point from the per-cell click above: a cell click
 * launches a single-skill Learn session (`targetSkillIds`), while this button launches a
 * whole-paradigm Practice session (`/practice/table/:wordId`,
 * `features/session-runner/hooks/useTablePracticeSession.ts`) that fills in every cell at
 * once with practice-damped SRS credit. The two are deliberately not unified into one click
 * handler — "train one form now" and "drill the whole table" are different user intents with
 * different session semantics (Learn vs Practice, single skill vs ~12).
 */
import { useNavigate } from 'react-router'
import { buildNounTable } from '@/content/paradigms.ts'
import { Button } from '@/components/ui/button.tsx'
import { MASTERED_THRESHOLD, skillMaturity } from '@/learning/progress/aggregate.ts'
import { CASE_LABELS, type NounDimension } from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { CaseValue } from '@/content/codec.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { cn } from '@/lib/utils'
import {
  CELL_BUTTON_CLASS,
  CELL_EMPTY_CLASS,
  CELL_FORM_CLASS,
  CELL_STATE_CLASS,
  TABLE_CLASS,
  TH_COL_CLASS,
  TH_ROW_CLASS,
  TR_CLASS,
} from './table-styles.ts'

function cellText(forms: readonly string[]): string {
  return forms.length > 0 ? forms.join(' / ') : '—'
}

/** Per-cell skill state caption — same "новое / X% / ✓" convention `ProgressSection.tsx`'s
 *  `formatMaturity` uses for the case-level average, applied here to one single skill instead
 *  (a NOUN case x number slot maps 1:1 to one skill, so there's nothing to average). */
function cellStateLabel(skill: SkillRecord | undefined): string {
  const maturity = skillMaturity(skill)
  if (skill === undefined || maturity <= 0) return 'новое'
  if (maturity >= MASTERED_THRESHOLD) return '✓'
  return `${Math.round(maturity * 100)}%`
}

function NounFormsCell({
  wordId,
  numberAbbrev,
  numberLabel,
  caseValue,
  forms,
  known,
  onTrain,
}: {
  wordId: WordId
  numberAbbrev: 'sg' | 'pl'
  numberLabel: string
  caseValue: CaseValue
  forms: readonly string[]
  known: ReadonlyMap<SkillId, SkillRecord>
  onTrain: (skillId: SkillId) => void
}) {
  if (forms.length === 0) {
    return <td className={CELL_EMPTY_CLASS}>—</td>
  }

  const dimension: NounDimension = `noun:${numberAbbrev}:${caseValue}`
  const skillId = encodeSkillId(wordId, dimension)
  const skill = known.get(skillId)
  const stateLabel = cellStateLabel(skill)
  const caseLabel = CASE_LABELS[caseValue]

  return (
    <td className="p-0">
      <button
        type="button"
        onClick={() => onTrain(skillId)}
        aria-label={`${caseLabel.pl} (${caseLabel.ru}), ${numberLabel}: ${cellText(forms)} — ${stateLabel}. Тренировать.`}
        className={CELL_BUTTON_CLASS}
      >
        <span className={CELL_FORM_CLASS}>{cellText(forms)}</span>
        <span aria-hidden="true" className={CELL_STATE_CLASS}>
          {stateLabel}
        </span>
      </button>
    </td>
  )
}

export function NounFormsTable({
  wordId,
  paradigm,
  skills,
}: {
  wordId: WordId
  paradigm: Paradigm
  /** Every `SkillRecord` this word currently has (any kind, not just `noun:*`) — mirrors
   *  `ProgressSection`'s own `skills` prop shape so `WordDetailContent` can pass the same
   *  `useWordSkills(wordId)` result to both without reshaping it. */
  skills: readonly SkillRecord[] | undefined
}) {
  const navigate = useNavigate()
  const table = buildNounTable(paradigm)
  const known = new Map((skills ?? []).map((s) => [s.skillId, s] as const))

  function handleTrain(skillId: SkillId) {
    navigate('/session', { state: { targetSkillIds: [skillId] } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className={cn(TABLE_CLASS, 'min-w-[300px]')}>
          <thead>
            <tr>
              <th scope="col" className={TH_COL_CLASS}>
                Падеж
              </th>
              <th scope="col" className={TH_COL_CLASS}>
                Ед. число
              </th>
              <th scope="col" className={TH_COL_CLASS}>
                Мн. число
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.case} className={TR_CLASS}>
                <th scope="row" className={TH_ROW_CLASS}>
                  <span className="block text-label-md font-semibold tracking-[0.04em] uppercase">
                    {CASE_LABELS[row.case].pl}
                  </span>
                  <span className="block text-label-sm font-medium text-muted-foreground">
                    {CASE_LABELS[row.case].ru}
                  </span>
                </th>
                <NounFormsCell
                  wordId={wordId}
                  numberAbbrev="sg"
                  numberLabel="liczba pojedyncza"
                  caseValue={row.case}
                  forms={row.singular}
                  known={known}
                  onTrain={handleTrain}
                />
                <NounFormsCell
                  wordId={wordId}
                  numberAbbrev="pl"
                  numberLabel="liczba mnoga"
                  caseValue={row.case}
                  forms={row.plural}
                  known={known}
                  onTrain={handleTrain}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => navigate(`/practice/table/${encodeURIComponent(wordId)}`)}
        className="min-h-11 self-start"
      >
        Тренировать таблицей
      </Button>
    </div>
  )
}
