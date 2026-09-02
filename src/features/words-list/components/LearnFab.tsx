/**
 * Floating "Учить" button (`spec/tasks/07-words-list.md` §7).
 *
 * Task 19 now exists and owns the real design this task's own text described up front:
 * "opens the session setup screen (task 19) pre-filled with the current filters". Before
 * task 19, no session-setup screen existed at all — this button navigated straight to
 * `/session` (task 06's stub, later task 13's real Learn runner) carrying the filter as
 * router state, per the supervisor's explicit resolution for task 07 (see this file's git
 * history for that reasoning). That resolution was always scoped to "until task 19 ships" —
 * it now has, so this closes the loop task 07 deliberately left open: `/practice`
 * (`pages/practice/PracticeSetupPage.tsx`) reads the same `{ filter }` router-state shape and
 * pre-fills `TrainingSetupScreen`'s level/status/frequency/section fields from it (task 19
 * acceptance point 8) — `WordActions.tsx`'s single-word "Учить" (task 08) is untouched: that
 * one targets one specific word, not a section/filter, so it has no use for a training-setup
 * screen and keeps navigating straight to `/session` with `{ wordId }`.
 */
import { GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { WordQuery } from '@/content/query.ts'

export function LearnFab({ query }: { query: WordQuery }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/practice', { state: { filter: query } })}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] z-10 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-100"
    >
      <GraduationCap aria-hidden="true" className="size-5" />
      Учить
    </button>
  )
}
