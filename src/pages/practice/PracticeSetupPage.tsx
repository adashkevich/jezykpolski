/**
 * `/practice` — the real "Настройка тренировки" screen (`spec/tasks/19-practice-mode.md`,
 * replacing the task-07 stub). Reads `location.state.filter` for the one payload
 * `LearnFab.tsx` (task 07 §7, updated by this task) sends here — the current `/words` filter,
 * pre-filling the level/status/frequency/section fields (acceptance point 8). A plain visit
 * with no state (direct navigation, or a future entry point) gets `undefined`, and
 * `TrainingSetupScreen` falls back entirely to the last-saved config (acceptance point 7).
 */
import { useLocation } from 'react-router'
import type { WordQuery } from '@/content/query.ts'
import { TrainingSetupScreen } from '@/features/training-setup/components/TrainingSetupScreen.tsx'

export function PracticeSetupPage() {
  const location = useLocation()
  const state = location.state as { filter?: WordQuery } | null
  return <TrainingSetupScreen initialFilter={state?.filter} />
}

export default PracticeSetupPage
