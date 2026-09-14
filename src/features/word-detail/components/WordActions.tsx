/**
 * "Не учить" / "Знаю" — the word-detail card's spaced-repetition actions
 * (`spec/design/word-noun.png`, `spec/tasks/08-word-detail.md` §5, `spec/tasks/16-swipe-triage.md`
 * §5). Both call the same `db/repositories/swipe.repository.ts` functions the `/words` list's
 * swipe gesture uses — one non-gesture button-equivalent for each direction, on the card, per
 * NFR-11 and task 16's explicit instruction that the triage functionality must not exist only
 * as a swipe:
 *
 *  - "Знаю" -> `markWordKnown`: all three vocab dimensions move to a known FSRS state.
 *  - "Не учить" -> `forgetWordVocab`: deletes the word's vocab skills outright rather than
 *    resetting them (see that function's own doc comment for why deleting, not resetting, is
 *    the right shape for "stop teaching me this").
 *
 * Both go through the same `useUndoableAction` toast as the `/words` list swipe, and both
 * return a `TriageSnapshot` that `undoTriage` reverts identically regardless of whether the
 * original write put records or deleted them.
 *
 * The card previously also carried "Не знаю", "Учить" and "Сбросить прогресс" buttons
 * (task 08/16's original scope); the mockup's card shows only these two, so the other three
 * were removed from this screen rather than restyled.
 */
import { Check, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { UndoToast } from '@/components/app/UndoToast.tsx'
import { forgetWordVocab, markWordKnown, undoTriage } from '@/db/repositories/swipe.repository.ts'
import { useUndoableAction } from '@/hooks/useUndoableAction.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'

export function WordActions({ wordId, lemma }: { wordId: WordId; lemma: string }) {
  const { pending, show, confirmUndo, dismiss } = useUndoableAction()

  async function handleMarkKnown() {
    const snapshot = await markWordKnown(wordId)
    show(`«${lemma}»: знаю`, () => undoTriage(snapshot))
  }

  async function handleForget() {
    const snapshot = await forgetWordVocab(wordId)
    show(`«${lemma}»: не учить`, () => undoTriage(snapshot))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleForget}
          className="min-h-12 flex-1"
        >
          <EyeOff aria-hidden="true" className="size-4" />
          Не учить
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleMarkKnown}
          className="min-h-12 flex-1"
        >
          <Check aria-hidden="true" className="size-4" />
          Знаю
        </Button>
      </div>

      {pending && <UndoToast message={pending.message} onUndo={confirmUndo} onDismiss={dismiss} />}
    </div>
  )
}
