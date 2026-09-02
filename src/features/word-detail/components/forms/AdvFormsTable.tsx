/**
 * ADV forms — degrees of comparison only (`spec/tasks/08-word-detail.md` §3, FR-05: "Раздел
 * Наречия ограничен степенями сравнения (в данных только `degree`)"). Same `adj:degree:*`-
 * style lookup as `AdjFormsTable`'s degree block, just the `adv:` namespace and no case/
 * gender grid above it — adverbs don't decline.
 *
 * Task 22 (`spec/tasks/22-adjectives-section.md` step 4, acceptance "Наречия используют тот
 * же компонент степеней сравнения"): the actual row list now renders through the shared
 * `DegreeComparisonBlock`, the same component `AdjFormsTable` uses for its own degree block —
 * this file only computes ADV's rows and keeps its own empty-state message (an adverb with no
 * comparison forms has nothing else on the card to show, unlike an ADJ card which still has
 * its case x gender table above).
 */
import { getFormsForSlot } from '@/content/paradigms.ts'
import { DEGREE_DISPLAY_ORDER } from '@/learning/skills/dimensions.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { DegreeComparisonBlock, type DegreeRow } from './DegreeComparisonBlock.tsx'

export function AdvFormsTable({
  wordId,
  paradigm,
  skills,
}: {
  wordId: WordId
  paradigm: Paradigm
  skills: readonly SkillRecord[] | undefined
}) {
  const degreeRows: DegreeRow[] = DEGREE_DISPLAY_ORDER.map((degree) => ({
    degree,
    forms: getFormsForSlot(paradigm, `adv:degree:${degree}` as Dimension),
  })).filter((row) => row.forms.length > 0)

  if (degreeRows.length === 0) {
    return <p className="text-sm text-muted-foreground">Для этого наречия нет форм сравнения.</p>
  }

  return <DegreeComparisonBlock rows={degreeRows} kind="adv" wordId={wordId} skills={skills} />
}
