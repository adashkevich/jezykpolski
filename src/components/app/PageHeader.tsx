import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Per-page heading block, rendered as the first child inside each page's `<PageContainer>`
 * (`spec/tasks/06-app-shell-pwa.md` §4). Distinct from `AppShell`'s persistent top bar (the
 * brand mark + settings button that appear on every route) — this is the page-specific
 * "what am I looking at" title, the same way every list/detail screen in the later feature
 * tasks needs one.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  /** Optional trailing control, e.g. a filter toggle or a primary action button. */
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl leading-tight font-semibold text-foreground">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
