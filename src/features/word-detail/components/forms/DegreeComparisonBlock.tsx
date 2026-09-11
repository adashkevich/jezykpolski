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

  // Tiles side by side (`spec/design/word-adjective.png`): degree name above, the form below —
  // the plain positive in ink, comparative/superlative in carmine since they're the changed
  // forms worth noticing.
  const tileClass =
    'flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl bg-secondary px-2 py-3 text-center'
  const formClass = (degree: DegreeValue) =>
    degree === 'positive'
      ? 'text-headline-sm font-bold break-words text-foreground'
      : 'text-headline-sm font-bold break-words text-primary-strong'

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-label-md font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Степени сравнения
      </h4>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
        {rows.map((row) => {
          const label = DEGREE_LABELS[row.degree]
          const formsText = row.forms.join(' / ')

          if (!hasSkillFor(kind, row.degree)) {
            return (
              <li key={row.degree} className={tileClass}>
                <span className="text-label-md text-muted-foreground">{label.pl}:</span>
                <span className={formClass(row.degree)}>{formsText}</span>
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
                className={`${tileClass} transition-colors hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
              >
                <span className="text-label-md text-muted-foreground">{label.pl}:</span>
                <span className={formClass(row.degree)}>{formsText}</span>
                <span aria-hidden="true" className="text-[10px] leading-none text-muted-foreground">
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
