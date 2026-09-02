/**
 * Confirmation dialog for "Сбросить прогресс" (`spec/tasks/08-word-detail.md` §5,
 * acceptance point 8: "с подтверждением"). A Radix `AlertDialog` (not the app's own `Sheet`,
 * which wraps `Dialog` — an `AlertDialog` is the right primitive here specifically because
 * it requires an explicit action/cancel choice rather than closing on an outside click,
 * which a destructive "delete all progress for this word" confirmation should not do by
 * accident). Styling mirrors `components/ui/sheet.tsx`'s overlay/content conventions
 * (`bg-popover`, the same `data-open`/`data-closed` animation classes) so it doesn't look
 * like a one-off despite not being a shared `components/ui/**` primitive itself — this is
 * the only place in the app an alert-style confirmation is needed so far.
 */
import { AlertDialog } from 'radix-ui'
import { Button } from '@/components/ui/button.tsx'

export function ResetProgressDialog({
  open,
  onOpenChange,
  lemma,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lemma: string
  onConfirm: () => void
  isPending: boolean
  error: string | null
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30 duration-100 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover bg-clip-padding p-4 text-popover-foreground shadow-lg duration-150 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95">
          <AlertDialog.Title className="font-heading text-base font-medium text-foreground">
            Сбросить прогресс «{lemma}»?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            Это удалит весь прогресс по переводу и формам этого слова — оно снова станет «новым».
            Действие нельзя отменить.
          </AlertDialog.Description>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" className="min-h-11" disabled={isPending}>
                Отмена
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                disabled={isPending}
                onClick={(event) => {
                  // Radix closes an AlertDialog.Action on click by default — prevent that so
                  // the dialog stays open (with the error message) if `onConfirm` fails; the
                  // success path closes it itself (see `WordActions.tsx`'s `handleReset`).
                  event.preventDefault()
                  onConfirm()
                }}
              >
                {isPending ? 'Сбрасываем…' : 'Сбросить'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
