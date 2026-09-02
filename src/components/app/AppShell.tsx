import { Settings } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { BottomNavigation } from './BottomNavigation.tsx'
import { OfflineBanner } from './OfflineBanner.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'

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
 *
 * The root itself is `h-svh` (bounded), not `min-h-svh` (floor only, task 07 fix): with only
 * a minimum, a flex column has no actual height ceiling, so `main`'s `flex-1` has nothing
 * fixed to size itself against — a child taller than the viewport (task 07's `/words`, the
 * first route with real scrollable content) just grows the whole `<html>` instead of
 * `main`'s own `overflow-y-auto` ever engaging, defeating "the content region is the only
 * scroll container" above. `h-svh` gives the flex column an actual ceiling, so `main`
 * genuinely clips to the remaining space and its own scrollbar is what activates — load-
 * bearing for `@tanstack/react-virtual` inside it too: the virtualizer sizes its viewport off
 * its scroll container's real (bounded) height, not the page's.
 */
export function AppShell() {
  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
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

      <UpdateBanner />
      <OfflineBanner />

      {/* `tabIndex={0}` (task 26, axe `scrollable-region-focusable`): this is the app's one
          scroll container (this file's own header above), and a screen with little or no
          other focusable content — `/stats` with a tall-but-plain progress layout is the
          scan's actual repro — would otherwise be reachable by Tab but never actually
          scrollable by a keyboard-only user once its content overflows the viewport. Making
          the container itself a tab stop gives Arrow/Page Down/End something to scroll no
          matter what the current route renders inside it. */}
      <main
        tabIndex={0}
        className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]"
      >
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
