/**
 * "Ещё" / "К списку практик" — shown after a POS-independent lexical drill finishes
 * ("Выбор перевода", "Написание по-польски", "Сопоставление";
 * `spec/tasks/36-practice-screen-restructure.md` §4, FR-149). Used by
 * `SessionResultPage.tsx` (for the two `/session`-routed drills) and
 * `MatchingPracticePage.tsx` (for "Сопоставление", which has no results screen of its own).
 * Deliberately NOT used by the forms-training result screen — that one keeps its existing
 * "Разобрать ошибки"/"Закончить" pair (task 36's own scoping decision: forms training is not
 * a "run it again" drill in the same sense, see this task's own decision log).
 */
import { Button } from '@/components/ui/button.tsx'

export interface PracticeDrillActionsProps {
  /** Starts a fresh batch of the same drill in place — disabled while the next batch is being
   *  resolved (both callers resample from the same lexical filter, an async Dexie read). */
  onAgain(): void
  readonly againDisabled: boolean
  onBackToList(): void
}

export function PracticeDrillActions({
  onAgain,
  againDisabled,
  onBackToList,
}: PracticeDrillActionsProps) {
  return (
    <div className="flex gap-3">
      <Button type="button" className="min-h-11 flex-1" disabled={againDisabled} onClick={onAgain}>
        Ещё
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 flex-1"
        onClick={onBackToList}
      >
        К списку практик
      </Button>
    </div>
  )
}

export default PracticeDrillActions
