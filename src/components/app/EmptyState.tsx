import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared "nothing here" state (`spec/tasks/06-app-shell-pwa.md` §4) — an empty word list
 * after filtering, zero due reviews, an empty session queue, etc. Unlike `ErrorState`, this
 * is not a failure: no retry, just an explanation and an optional way forward (`action`).
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
