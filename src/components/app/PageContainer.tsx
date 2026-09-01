import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Standard content wrapper every page under `AppShell`'s `<Outlet>` renders itself in
 * (`spec/tasks/06-app-shell-pwa.md` §4). Keeps padding/max-width consistent across pages and
 * is the one place mobile-first spacing lives, instead of every page re-deriving it.
 *
 * Deliberately does NOT own scrolling or bottom padding for the fixed `BottomNavigation` —
 * `AppShell`'s content region already does both (`overflow-y-auto` + a bottom inset sized to
 * the nav's real height plus the safe area), so nesting a second scroll container here would
 * just double-apply it.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-screen-sm flex-col gap-4 px-4 py-4', className)}>
      {children}
    </div>
  )
}
