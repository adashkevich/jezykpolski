/**
 * "Знаю" / "Не знаю" / "Учить" / "Сбросить прогресс" — `spec/tasks/08-word-detail.md` §5,
 * FR-48, `spec/tasks/16-swipe-triage.md` §5.
 *
 * This task's actions land at different depths, per the supervisor's explicit resolution for
 * task 08 (recorded in that task's decision log / final report) and task 16 (this file):
 *
 *  - "Сбросить прогресс" is fully real: confirm (`ResetProgressDialog`) -> delete every
 *    `SkillRecord` for the word (`skills.repository.ts#resetWord`, task 05) -> recompute the
 *    denormalized cache (`words-progress.repository.ts#recomputeWordProgress`, task 05).
 *    `resetWord` already deletes the `wordProgress` row itself (see that function's own
 *    header), so the explicit `recomputeWordProgress` call after it is a no-op in practice —
 *    kept anyway because the task text names it explicitly ("удаляет навыки слова и
 *    пересчитывает wordProgress") and because it makes this code correct-by-construction
 *    rather than correct-by-relying-on-`resetWord`'s-current-implementation-detail: if
 *    `resetWord` ever stopped clearing `wordProgress` itself, this call still would.
 *  - "Учить" is plain navigation, exactly like `features/words-list/components/LearnFab.tsx`
 *    (task 07) for the *list* screen: `navigate('/session', { state: { wordId } })`. No
 *    queue is built, no exercise runs — task 13 is what will read this state once
 *    `SessionPage` stops being a stub. The state shape here (`{ wordId }`) is deliberately
 *    NOT `LearnFab`'s `{ filter: WordQuery }` — a single word isn't expressible as a
 *    `WordQuery` without abusing `search` for exact-lemma matching (unreliable: `search` is
 *    substring, not exact), so this is its own, equally-provisional shape for task 13 to
 *    read a "just this one word" scope from.
 *  - "Знаю" / "Не знаю" (task 16, this file — task 08 left "Знаю" `disabled` with a "see task
 *    16" tooltip specifically because the SRS policy it needs, `SWIPE_KNOWN_INITIAL_STABILITY`,
 *    didn't exist yet) call the exact same `db/repositories/swipe.repository.ts` functions the
 *    `/words` list's swipe gesture uses (`markWordKnown`/`markWordUnknown` + `undoTriage`),
 *    via the same shared `useUndoableAction` hook — one non-gesture button-equivalent for
 *    each direction, on the card, per NFR-11 and the task's explicit instruction that the
 *    triage functionality must not exist only as a swipe. "Не знаю" wasn't in app-design.md
 *    §4's original card mockup (only "Знаю"/"Учить" are drawn there) — added per the
 *    supervisor's explicit instruction for this task, since FR-29's "Не знаю" needs a
 *    non-gesture equivalent somewhere, and the card is the other place task 16 names for it.
 */
import { useState } from 'react'
import { Check, GraduationCap, RotateCcw, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { UndoToast } from '@/components/app/UndoToast.tsx'
import { resetWord } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { markWordKnown, markWordUnknown, undoTriage } from '@/db/repositories/swipe.repository.ts'
import { useUndoableAction } from '@/hooks/useUndoableAction.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { ResetProgressDialog } from './ResetProgressDialog.tsx'

export function WordActions({ wordId, lemma }: { wordId: WordId; lemma: string }) {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const { pending, show, confirmUndo, dismiss } = useUndoableAction()

  async function handleConfirmReset() {
    setIsResetting(true)
    setResetError(null)
    try {
      await resetWord(wordId)
      await recomputeWordProgress(wordId)
      setDialogOpen(false)
    } catch (error: unknown) {
      setResetError(
        error instanceof Error ? error.message : 'Не удалось сбросить прогресс. Попробуйте ещё раз.',
      )
    } finally {
      setIsResetting(false)
    }
  }

  async function handleMarkKnown() {
    const snapshot = await markWordKnown(wordId)
    show(`«${lemma}»: знаю`, () => undoTriage(snapshot))
  }

  async function handleMarkUnknown() {
    const snapshot = await markWordUnknown(wordId)
    show(`«${lemma}»: не знаю — добавлено к изучению`, () => undoTriage(snapshot))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleMarkUnknown}
          className="min-h-11 flex-1"
        >
          <X aria-hidden="true" className="size-4" />
          Не знаю
        </Button>
        <Button type="button" variant="secondary" onClick={handleMarkKnown} className="min-h-11 flex-1">
          <Check aria-hidden="true" className="size-4" />
          Знаю
        </Button>
      </div>
      <Button
        type="button"
        onClick={() => navigate('/session', { state: { wordId } })}
        className="min-h-11"
      >
        <GraduationCap aria-hidden="true" className="size-4" />
        Учить
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setResetError(null)
          setDialogOpen(true)
        }}
        className="min-h-11"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Сбросить прогресс
      </Button>

      <ResetProgressDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!isResetting) setDialogOpen(next)
        }}
        lemma={lemma}
        onConfirm={handleConfirmReset}
        isPending={isResetting}
        error={resetError}
      />

      {pending && <UndoToast message={pending.message} onUndo={confirmUndo} onDismiss={dismiss} />}
    </div>
  )
}
