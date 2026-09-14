/**
 * NOUN forms — case x number (`spec/tasks/08-word-detail.md` §3, FR-43), restyled to match
 * `spec/design/word-noun.png`: a "Ед. число / Мн. число" segmented switch above a single
 * column of 7 case rows, rather than a table with both numbers side by side. `buildNounTable`
 * (task 04, `content/paradigms.ts`) already returns the 7 rows in canonical case order
 * (M. D. C. B. N. Ms. W.) with singular/plural forms — this component only decides, per
 * render, which of the two to show and how to lay each one out.
 *
 * A slot with more than one valid form (e.g. `aborcji` / `aborcyj`, task 04's own example)
 * shows both, joined by " / " — `buildNounTable`'s `singular`/`plural` are already
 * de-duplicated arrays for exactly this reason. Each part is run through `splitEnding`
 * independently; the " / " separator itself is never highlighted.
 *
 * Pluralia tantum (e.g. `drzwi`, whose `singular` is empty for every case) default the switch
 * to "Мн. число" — opening on 7 dashes would be a worse first impression than starting on the
 * number that actually has forms.
 *
 * Task 17 (`spec/tasks/17-nouns-section.md` §4) added clickability: a slot with real forms is
 * a `<button>`, not bare text — it shows a "✓" once this word's own skill for that one
 * case/number cell is mastered (nothing otherwise — no "новое"/percentage clutter) and, on click, launches
 * a point training session for exactly that one skill (`navigate('/session', { state:
 * { targetSkillIds: [skillId] } })` — deliberately a different router-state key than
 * `SessionResultPage`'s `{ skillIds }`, which `session-scope.ts` maps to the mistakes mode this
 * click must NOT trigger; see that file's header for why). An empty slot ("—", no forms in the
 * paradigm at all) stays plain text — there is no `SkillDescriptor` for a dimension
 * `enumerateSkills` never produced, so `materializeQueueItem` would have nothing to resolve if
 * it were clickable (task 03's own rule: skills only for slots that actually exist).
 *
 * Wołacz (the last row, `case: 'vocative'`) is rendered and clickable exactly like every other
 * case — task 17 §6's "по умолчанию исключён из тренировки" is a queue-building concern
 * (`learning/skills/training-defaults.ts`, read by tasks 18/19), not a table-display one:
 * "доступен в таблице и включаем вручную" is precisely this list staying fully live.
 *
 * The row's accessible name deliberately mirrors the old two-column table's aria-label
 * template verbatim (`"{pl} ({ru}), {liczba pojedyncza|mnoga}: {forms} — {state}. Тренировать."`)
 * rather than adding the case question to it — the question is a visual-only reading aid
 * (`aria-hidden`), and several tests/e2e specs depend on this exact accessible-name shape.
 *
 * Task 18 (`spec/tasks/18-noun-exercises.md` step 4, FR-62) adds the "Тренировать таблицей"
 * button below the list — a SEPARATE entry point from the per-row click above: a row click
 * launches a single-skill Learn session (`targetSkillIds`), while this button launches a
 * whole-paradigm Practice session (`/practice/table/:wordId`,
 * `features/session-runner/hooks/useTablePracticeSession.ts`) that fills in every cell at once
 * with practice-damped SRS credit.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { buildNounTable } from '@/content/paradigms.ts'
import { Button } from '@/components/ui/button.tsx'
import { MASTERED_THRESHOLD, skillMaturity } from '@/learning/progress/aggregate.ts'
import { CASE_LABELS, CASE_QUESTIONS, type NounDimension } from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { CaseValue } from '@/content/codec.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { cn } from '@/lib/utils'
import { splitEnding, paradigmStem } from './form-ending.ts'
import {
  DECL_CASE_CLASS,
  DECL_CASE_RU_CLASS,
  DECL_ENDING_CLASS,
  DECL_FORM_CLASS,
  DECL_FORM_LINE_CLASS,
  DECL_LABEL_LINE_CLASS,
  DECL_LIST_CLASS,
  DECL_QUESTION_CLASS,
  DECL_ROW_CLASS,
  DECL_ROW_TINT_CLASS,
  DECL_STATE_CLASS,
  SEGMENT_ITEM_ACTIVE_CLASS,
  SEGMENT_ITEM_CLASS,
  SEGMENT_TRACK_CLASS,
} from './table-styles.ts'

type NumberOption = 'sg' | 'pl'

function cellText(forms: readonly string[]): string {
  return forms.length > 0 ? forms.join(' / ') : '—'
}

/** Per-cell skill state caption — only a mastered slot gets a caption ("✓"); an unmastered or
 *  not-yet-attempted slot shows nothing (no "новое"/percentage clutter on the declension list). */
function cellStateLabel(skill: SkillRecord | undefined): string {
  return skillMaturity(skill) >= MASTERED_THRESHOLD ? '✓' : ''
}

/** Renders `forms` (already " / "-joined text is NOT what's passed in — each form is split
 *  independently so only the real ending of each variant is highlighted). */
function FormText({ forms, stem }: { forms: readonly string[]; stem: string }) {
  return (
    <>
      {forms.map((form, index) => {
        const [head, ending] = splitEnding(form, stem)
        return (
          <span key={form}>
            {index > 0 && ' / '}
            {head}
            {ending && <span className={DECL_ENDING_CLASS}>{ending}</span>}
          </span>
        )
      })}
    </>
  )
}

function NounDeclensionRow({
  wordId,
  numberOption,
  numberLabel,
  caseValue,
  forms,
  stem,
  known,
  tinted,
  onTrain,
}: {
  wordId: WordId
  numberOption: NumberOption
  numberLabel: string
  caseValue: CaseValue
  forms: readonly string[]
  stem: string
  known: ReadonlyMap<SkillId, SkillRecord>
  tinted: boolean
  onTrain: (skillId: SkillId) => void
}) {
  const caseLabel = CASE_LABELS[caseValue]
  const question = CASE_QUESTIONS[caseValue]

  const labelLine = (
    <span className={DECL_LABEL_LINE_CLASS}>
      <span>
        <span className={DECL_CASE_CLASS}>{caseLabel.pl}</span>{' '}
        <span className={DECL_CASE_RU_CLASS}>({caseLabel.ru})</span>
      </span>
      <span aria-hidden="true" className={DECL_QUESTION_CLASS}>
        {question}
      </span>
    </span>
  )

  if (forms.length === 0) {
    return (
      <li className={cn(DECL_ROW_CLASS, tinted && DECL_ROW_TINT_CLASS)}>
        {labelLine}
        <span className={DECL_FORM_LINE_CLASS}>
          <span className="text-muted-foreground">—</span>
        </span>
      </li>
    )
  }

  const dimension: NounDimension = `noun:${numberOption}:${caseValue}`
  const skillId = encodeSkillId(wordId, dimension)
  const skill = known.get(skillId)
  const stateLabel = cellStateLabel(skill)

  return (
    <li>
      <button
        type="button"
        onClick={() => onTrain(skillId)}
        aria-label={`${caseLabel.pl} (${caseLabel.ru}), ${numberLabel}: ${cellText(forms)}${stateLabel ? ` — ${stateLabel}` : ''}. Тренировать.`}
        className={cn(DECL_ROW_CLASS, tinted && DECL_ROW_TINT_CLASS, 'w-full')}
      >
        {labelLine}
        <span className={DECL_FORM_LINE_CLASS}>
          <span className={DECL_FORM_CLASS}>
            <FormText forms={forms} stem={stem} />
          </span>
          {stateLabel && (
            <span aria-hidden="true" className={DECL_STATE_CLASS}>
              {stateLabel}
            </span>
          )}
        </span>
      </button>
    </li>
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

  const hasSingular = table.rows.some((row) => row.singular.length > 0)
  const [numberOption, setNumberOption] = useState<NumberOption>(hasSingular ? 'sg' : 'pl')

  // One stem per word, computed from every form in both numbers, so switching the tab never
  // shifts where the highlighted ending starts.
  const stem = useMemo(() => {
    const allForms = table.rows.flatMap((row) => [...row.singular, ...row.plural])
    return paradigmStem(allForms)
  }, [table])

  function handleTrain(skillId: SkillId) {
    navigate('/session', { state: { targetSkillIds: [skillId] } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Число" className={SEGMENT_TRACK_CLASS}>
        {(['sg', 'pl'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={numberOption === option}
            onClick={() => setNumberOption(option)}
            className={cn(SEGMENT_ITEM_CLASS, numberOption === option && SEGMENT_ITEM_ACTIVE_CLASS)}
          >
            {option === 'sg' ? 'Ед. число' : 'Мн. число'}
          </button>
        ))}
      </div>

      <ul className={DECL_LIST_CLASS}>
        {table.rows.map((row, index) => (
          <NounDeclensionRow
            key={row.case}
            wordId={wordId}
            numberOption={numberOption}
            numberLabel={numberOption === 'sg' ? 'liczba pojedyncza' : 'liczba mnoga'}
            caseValue={row.case}
            forms={numberOption === 'sg' ? row.singular : row.plural}
            stem={stem}
            known={known}
            tinted={index % 2 === 0}
            onTrain={handleTrain}
          />
        ))}
      </ul>

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
