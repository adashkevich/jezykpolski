/**
 * Floating "Учить" button (`spec/tasks/07-words-list.md` §7).
 *
 * The task text's real design is "opens the session setup screen (task 19) pre-filled with
 * the current filters". Task 19 (and the whole exercise/SRS/queue-building pipeline it
 * depends on — tasks 09/11/13) doesn't exist yet, and this task's dependency list (04, 05,
 * 06 only) confirms it isn't meant to build any of that. Per the supervisor's explicit
 * resolution for this task: navigate to `/session` (already routed, task 06 — currently a
 * stub `SessionPage`) carrying the current filter as router state
 * (`navigate('/session', { state: { filter: query } })`). This is plain navigation with a
 * payload, nothing more — no queue is built, no exercise is generated here. Task 13 ("сборка
 * очереди сессии") is what will read `location.state.filter` on `SessionPage` and act on it.
 */
import { GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { WordQuery } from '@/content/query.ts'

export function LearnFab({ query }: { query: WordQuery }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/session', { state: { filter: query } })}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] z-10 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-100"
    >
      <GraduationCap aria-hidden="true" className="size-5" />
      Учить
    </button>
  )
}
