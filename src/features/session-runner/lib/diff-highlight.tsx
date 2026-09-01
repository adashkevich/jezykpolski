/**
 * Renders a `grade()` near-miss `DiffHint` (`@/learning/exercises/grade.ts`) as highlighted
 * text — `spec/tasks/12-vocabulary-exercises.md` §4: "подсветить отличающиеся символы"
 * (the Polish diacritics the user's answer was missing). Pure presentation over data `grade()`
 * already computed; this file never calls `grade()` itself.
 */
import type { ReactNode } from 'react'

export function renderDiffHighlight(
  expected: string,
  diacriticIndexes: readonly number[],
): ReactNode {
  const highlighted = new Set(diacriticIndexes)
  return Array.from(expected).map((char, index) =>
    highlighted.has(index) ? (
      <mark
        key={index}
        className="rounded-sm bg-warning/30 px-0.5 font-bold text-foreground underline decoration-warning decoration-2"
      >
        {char}
      </mark>
    ) : (
      <span key={index}>{char}</span>
    ),
  )
}
