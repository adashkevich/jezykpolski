/**
 * Degrees of comparison (`positive`/`comparative`/`superlative`) — shared by `AdjFormsTable`
 * (case x gender grid above it, FR-45/FR-69) and `AdvFormsTable` (nothing else to show,
 * FR-05: "в данных только `degree`"). `spec/tasks/22-adjectives-section.md` step 4 requires
 * ADV to reuse "тем же компонентом, что и для прилагательных" rather than a second copy of
 * this list — this is that one component, extracted from what was previously duplicated
 * inline in both `AdjFormsTable.tsx` and `AdvFormsTable.tsx`.
 *
 * Only rendered for words that actually have degree forms in their paradigm (acceptance:
 * "Степени сравнения показываются только у слов, где они есть") — callers filter
 * `degreeRows` down to non-empty slots via `getFormsForSlot` before passing them in; this
 * component itself renders nothing (`null`) if it ends up with an empty list, as a second,
 * defensive line of the same rule.
 *
 * Click-to-train (task 22's own acceptance check: "точечный клик по степени сравнения
 * (comparative) запускает реальное упражнение"): same `navigate('/session', { state: {
 * targetSkillIds: [skillId] } })` mechanism `NounFormsTable`/`VerbFormsTable` (tasks 17/20)
 * already use for their own per-cell clicks — this is the ADJ/ADV equivalent, one row at a
 * time. `FormsSection.tsx`'s own doc comment used to say "ADJ/ADV still get neither wordId
 * nor skills — no click-to-train for them yet"; this task is that "yet", for the degree rows
 * specifically (the case x gender grid stays plain display, out of this task's declared
 * scope — see `AdjFormsTable.tsx`'s own header).
 *
 * Not every row has a skill to train, though: `learning/skills/enumerate.ts`'s ADV branch
 * only ever produces `adv:degree:comparative`/`adv:degree:superlative` — never
 * `adv:degree:positive` (an adverb's own positive form is just itself, nothing to recall).
 * ADJ has no such gap (its citation-slot rule fires for any degree present, including
 * `positive`). `hasSkillFor` below encodes exactly that asymmetry so an ADV positive row
 * renders as plain text, never a button with nothing real to navigate to.
 */
import { useNavigate } from 'react-router'
import type { DegreeValue } from '@/content/codec.ts'
import { MASTERED_THRESHOLD, skillMaturity } from '@/learning/progress/aggregate.ts'
import { DEGREE_LABELS } from '@/learning/skills/dimensions.ts'
import { encodeSkillId, type SkillId, type WordId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'

export interface DegreeRow {
  readonly degree: DegreeValue
  readonly forms: readonly string[]
}

function cellStateLabel(skill: SkillRecord | undefined): string {
  const maturity = skillMaturity(skill)
  if (skill === undefined || maturity <= 0) return 'новое'
  if (maturity >= MASTERED_THRESHOLD) return '✓'
  return `${Math.round(maturity * 100)}%`
}

/** `enumerateSkills`'s own asymmetry (see file header): ADJ always has a skill for any
 *  degree present in the data, ADV never has one for `positive`. */
function hasSkillFor(kind: 'adj' | 'adv', degree: DegreeValue): boolean {
  return kind === 'adj' || degree !== 'positive'
}

export function DegreeComparisonBlock({
  rows,
  kind,
  wordId,
  skills,
}: {
  rows: readonly DegreeRow[]
  /** Which dimension namespace these rows' skills live under — `adj:degree:*` or
   *  `adv:degree:*` (`spec/architecture.md` §5.1). */
  kind: 'adj' | 'adv'
  wordId: WordId
  skills: readonly SkillRecord[] | undefined
}) {
  // `useNavigate` must run unconditionally (React's rules of hooks) — the empty-rows early
  // return has to come after it, not before.
  const navigate = useNavigate()
  if (rows.length === 0) return null

  const known = new Map((skills ?? []).map((s) => [s.skillId, s] as const))

  function handleTrain(skillId: SkillId) {
    navigate('/session', { state: { targetSkillIds: [skillId] } })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium text-foreground">Степени сравнения</h4>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((row) => {
          const label = DEGREE_LABELS[row.degree]
          const formsText = row.forms.join(' / ')

          if (!hasSkillFor(kind, row.degree)) {
            return (
              <li key={row.degree} className="flex items-baseline gap-2 px-1 py-0.5">
                <span className="text-muted-foreground">{label.pl}:</span>
                <span className="text-foreground">{formsText}</span>
              </li>
            )
          }

          const skillId = encodeSkillId(wordId, `${kind}:degree:${row.degree}`)
          const stateLabel = cellStateLabel(known.get(skillId))

          return (
            <li key={row.degree}>
              <button
                type="button"
                onClick={() => handleTrain(skillId)}
                aria-label={`${label.pl} (${label.ru}): ${formsText} — ${stateLabel}. Тренировать.`}
                className="flex w-full items-baseline gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
              >
                <span className="text-muted-foreground">{label.pl}:</span>
                <span className="text-foreground">{formsText}</span>
                <span aria-hidden="true" className="ml-auto text-[10px] leading-none text-muted-foreground">
                  {stateLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
