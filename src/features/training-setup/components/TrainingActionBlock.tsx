/**
 * One always-open "lexical drill" block on `TrainingSetupScreen`
 * (`spec/tasks/36-practice-screen-restructure.md` §3, FR-148) — "Выбор перевода (PL → RU)",
 * "Написание по-польски (RU → PL)" and "Сопоставление". Same outer card as `TrainingBlock.tsx`
 * (task 32), but with no disclosure behavior at all: these three blocks' entire body is one
 * "Начать" button (plus an occasional "too few words" message), so hiding it behind a click
 * only added a wasted tap — task 32's collapse-by-default rule made sense when the forms
 * configurator's dozen controls were the alternative, not here.
 *
 * `TrainingBlock.tsx` itself is unchanged and still used for the three per-section forms
 * blocks, which do have real disclosure-worthy content.
 */
import type { ReactNode } from 'react'

export interface TrainingActionBlockProps {
  readonly title: string
  readonly summary: string
  readonly children: ReactNode
}

export function TrainingActionBlock({ title, summary, children }: TrainingActionBlockProps) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <span className="flex flex-col gap-0.5">
        <span className="font-heading text-base font-medium text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{summary}</span>
      </span>
      {children}
    </section>
  )
}

export default TrainingActionBlock
