import { Button } from '@/components/ui/button'

/**
 * Full-screen error state shown by `ContentProvider` when loading the content index fails
 * (`spec/tasks/04-content-access-layer.md` §6) — offline on first visit, a bad deploy, a
 * codec/content version mismatch (`loader.ts`'s `CodecVersionMismatchError`), etc. Always
 * offers a retry button, per the task text.
 *
 * `secondaryAction` is optional and additive (task 05, `db/database.ts`'s `ErrorState`
 * consumer needs a second, more drastic "reset the local database" button alongside plain
 * retry — blueprint §19's "meaningful boundary" for IndexedDB initialization failure,
 * `spec/tasks/05-persistence.md` §7). Omitting it (every other current caller) renders
 * exactly the single-button layout this component always had.
 */
export interface ErrorStateProps {
  readonly message: string
  readonly onRetry: () => void
  readonly secondaryAction?: {
    readonly label: string
    readonly onClick: () => void
  }
}

export function ErrorState({ message, onRetry, secondaryAction }: ErrorStateProps) {
  return (
    <main
      role="alert"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
    >
      <p className="font-medium">Nie udało się załadować słownika</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-col gap-2">
        {/* min-h-11 keeps the touch target >= 44px (NFR-11) even though the shared Button's
            own default height is smaller. */}
        <Button onClick={onRetry} className="min-h-11 px-6">
          Spróbuj ponownie
        </Button>
        {secondaryAction && (
          <Button onClick={secondaryAction.onClick} variant="outline" className="min-h-11 px-6">
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </main>
  )
}
