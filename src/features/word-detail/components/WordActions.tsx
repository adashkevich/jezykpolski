/**
 * "Знаю" / "Учить" / "Сбросить прогресс" — `spec/tasks/08-word-detail.md` §5, FR-48.
 *
 * This task's three actions land at three different depths, per the supervisor's explicit
 * resolution for task 08 (recorded in this task's decision log / final report):
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
 *  - "Знаю" is visible (`app-design.md` §4 puts it in the button row) but genuinely inert:
 *    the task text's own description — "перевести vocab-навыки в состояние `known` с
 *    умеренной начальной стабильностью" — is verbatim the swipe-triage policy task 16 owns
 *    (`spec/tasks/16-swipe-triage.md` §5, `SWIPE_KNOWN_INITIAL_STABILITY`), which itself
 *    needs the FSRS adapter (task 11) neither of which are dependencies of task 08 (only 04,
 *    05, 07 are). Implementing a task-08-local approximation would create a second,
 *    divergent "what does пометить-as-known mean" policy right before task 16 defines the
 *    real one. So: rendered, `disabled`, with a `title` tooltip explaining why — not a
 *    silent no-op button, not a fake progress update.
 */
import { useState } from 'react'
import { Check, GraduationCap, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { resetWord } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import { ResetProgressDialog } from './ResetProgressDialog.tsx'

export function WordActions({ wordId, lemma }: { wordId: WordId; lemma: string }) {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled
          title="Появится в задаче 16 — оценка «Знаю» через SRS-политику свайпов"
          className="min-h-11 flex-1"
        >
          <Check aria-hidden="true" className="size-4" />
          Знаю
        </Button>
        <Button
          type="button"
          onClick={() => navigate('/session', { state: { wordId } })}
          className="min-h-11 flex-1"
        >
          <GraduationCap aria-hidden="true" className="size-4" />
          Учить
        </Button>
      </div>
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
    </div>
  )
}
