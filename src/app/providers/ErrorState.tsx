import { Button } from '@/components/ui/button'

/**
 * Full-screen error state shown by `ContentProvider` when loading the content index fails
 * (`spec/tasks/04-content-access-layer.md` §6) — offline on first visit, a bad deploy, a
 * codec/content version mismatch (`loader.ts`'s `CodecVersionMismatchError`), etc. Always
 * offers a retry button, per the task text.
 */
export interface ErrorStateProps {
  readonly message: string
  readonly onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <main
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
    >
      <p className="font-medium">Nie udało się załadować słownika</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {/* min-h-11 keeps the touch target >= 44px (NFR-11) even though the shared Button's
          own default height is smaller. */}
      <Button onClick={onRetry} className="min-h-11 px-6">
        Spróbuj ponownie
      </Button>
    </main>
  )
}
