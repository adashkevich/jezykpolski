/**
 * "Выйти" confirmation (`spec/tasks/13-session-runner.md` §6): "Прогресс уже сохранён,
 * терять нечего — но пользователя надо предупредить, что сессия закроется." Same
 * `AlertDialog` pattern as `word-detail/components/ResetProgressDialog.tsx` (task 08) —
 * an explicit choice, not a dismiss-on-outside-click sheet, since leaving mid-session is
 * still a deliberate action worth a beat of friction even though nothing is actually lost.
 */
import { AlertDialog } from 'radix-ui'
import { Button } from '@/components/ui/button.tsx'

export function ExitSessionDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30 duration-100 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover bg-clip-padding p-4 text-popover-foreground shadow-lg duration-150 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95">
          <AlertDialog.Title className="font-heading text-base font-medium text-foreground">
            Выйти из сессии?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            Весь прогресс уже сохранён — можно продолжить позже. Но текущая сессия закроется, и
            оставшиеся задания перейдут в следующую.
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Остаться
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant="destructive" className="min-h-11" onClick={onConfirm}>
                Выйти
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
