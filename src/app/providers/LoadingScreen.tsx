/**
 * Full-screen loading state shown by `ContentProvider` while `manifest.json` + `index.json`
 * are in flight (`spec/tasks/04-content-access-layer.md` §6). A stub in the sense that it
 * carries no branding/illustration yet — task 06 owns the real app shell — but it is the
 * actual component `ContentProvider` renders, not a placeholder to be swapped out.
 */
export function LoadingScreen() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-foreground"
    >
      <div
        aria-hidden="true"
        className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary motion-reduce:animate-none"
      />
      <p className="text-muted-foreground">Ładowanie słownika…</p>
    </main>
  )
}
