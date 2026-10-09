/**
 * Home-screen banner after the dictionary change (task 49 §1,
 * `spec/tasks/49-primary-sense-learning-and-level-reset.md`): word levels were recomputed (each
 * word now has the level of its primary sense), so new words start from A1 again. Shown until
 * the user closes it — the cross deletes `meta.contentV2Notice` (`useContentV2Notice`), after
 * which it never comes back.
 *
 * What it says comes from the live level gate, not from anything stored: "осталось N" is the
 * unstarted-word count of the level new words are coming from right now. Normally that is A1
 * («Новые слова снова идут с A1 — осталось N»). When A1 has nothing unstarted left (the user
 * had already started all of the new A1) the gate has moved on, and so does the banner —
 * «Новые слова идут с A2 — осталось N» — never an empty line; when the whole open range is
 * started there is no second sentence at all. If the start level was above A1, the reset is
 * mentioned too, so the user knows where to change it back.
 */
import { Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { clearContentV2Notice } from '@/db/repositories/meta.repository.ts'
import { useContentV2Notice } from '@/hooks/useContentV2Notice.ts'
import { useLevelGate } from '@/hooks/useLevelGate.ts'
import { NEW_WORDS_START_LEVEL_DEFAULT } from '@/learning/session/level-gate.ts'

export function ContentV2Notice() {
  const notice = useContentV2Notice()
  const levelGate = useLevelGate()
  if (!notice || !levelGate) return null

  const { currentLevel, unstartedByLevel } = levelGate
  const updated = 'Словарь обновлён: уровни слов пересчитаны.'
  const newWords = currentLevel
    ? `${currentLevel === NEW_WORDS_START_LEVEL_DEFAULT ? 'Новые слова снова идут' : 'Новые слова идут'} с ${currentLevel} — осталось ${unstartedByLevel[currentLevel]}`
    : null
  const reset =
    notice.previousStartLevel !== NEW_WORDS_START_LEVEL_DEFAULT
      ? `Начальный уровень сброшен с ${notice.previousStartLevel} на ${NEW_WORDS_START_LEVEL_DEFAULT}, изменить можно в настройках`
      : null

  return (
    <section
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-border bg-primary-soft py-3 pr-1 pl-4"
    >
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-strong" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-body-sm text-foreground">
        <p>{newWords ? `${updated} ${newWords}` : updated}</p>
        {reset && <p>{reset}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-my-1.5 shrink-0 text-muted-foreground"
        aria-label="Закрыть"
        onClick={() => void clearContentV2Notice()}
      >
        <X aria-hidden="true" />
      </Button>
    </section>
  )
}
