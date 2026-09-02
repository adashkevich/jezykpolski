/**
 * "Отменить" toast (`spec/tasks/16-swipe-triage.md` §4) — paired with `useUndoableAction.ts`,
 * which owns the timer/pending-state this component just renders. No toast library in the
 * project (`package.json` has none), and exactly two call sites need one
 * (`WordsListPage.tsx`'s swipe/button triage, `WordActions.tsx`'s «Знаю»/«Не знаю»), so a
 * small purpose-built component is simpler than adding a dependency for it.
 *
 * `role="status"` + `aria-live="polite"` (not `alert`/`assertive`): the toast reports a
 * completed action, not an error demanding immediate attention — NFR-11's accessibility bar
 * without being obnoxious to screen-reader users mid-scroll.
 *
 * Default bottom offset matches `LearnFab.tsx`'s own floating-above-`BottomNavigation`
 * convention (`5rem` clears the nav bar, `+ env(safe-area-inset-bottom)` clears the home
 * indicator, `+ 0.75rem` is the same breathing room `LearnFab` uses). `className` can
 * override it — `WordsListPage.tsx` does, to sit above `LearnFab` itself rather than under it.
 */
import { Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  className,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 flex items-center justify-between gap-3 rounded-xl border border-border bg-foreground px-4 py-3 text-background shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
        className,
      )}
    >
      <span className="text-sm">{message}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="min-h-11 text-background hover:bg-background/10 hover:text-background"
        >
          <Undo2 aria-hidden="true" className="size-4" />
          Отменить
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label="Закрыть уведомление"
          className="min-h-11 min-w-11 text-background hover:bg-background/10 hover:text-background"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  )
}
