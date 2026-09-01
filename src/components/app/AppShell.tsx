import { Settings } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { BottomNavigation } from './BottomNavigation.tsx'

/**
 * Top-level layout every route renders inside (`spec/tasks/06-app-shell-pwa.md` §2):
 *
 * ```text
 * AppShell
 * ├── top bar (brand + settings icon button — NOT a bottom-nav tab, see BottomNavigation.tsx)
 * ├── Outlet (page content)
 * └── BottomNavigation
 * ```
 *
 * `architecture.md` §9's shell diagram only names `Outlet` + `BottomNavigation` as children;
 * the persistent top bar is this task's own addition to give "Настройки — иконкой в шапке"
 * (required by both the task text and architecture.md §9) a single, always-reachable home
 * instead of every future page having to remember to render its own settings affordance.
 *
 * Mobile-first (task §3): the content region is the only scroll container, with a
 * bottom inset sized to clear the fixed `BottomNavigation` (its own height plus
 * `env(safe-area-inset-bottom)`) so content never renders underneath it. The top bar grows
 * with `env(safe-area-inset-top)` via `min-h` + padding (not a fixed `h-*`) so it doesn't get
 * clipped under a notch/Dynamic Island.
 */
export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header
        className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Link
          to="/"
          className="rounded-md font-heading text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Polski
        </Link>
        <Link
          to="/settings"
          aria-label="Настройки"
          className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Settings aria-hidden="true" className="size-5" />
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
