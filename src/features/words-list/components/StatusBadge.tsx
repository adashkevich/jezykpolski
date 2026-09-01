/**
 * Word status indicator for a `/words` row (`spec/tasks/07-words-list.md` §2, NFR-11).
 *
 * "Статус показывается не только цветом" — NFR-11 forbids color-only status coding (a
 * color-blind user cannot tell `known` green from `mastered` purple by hue alone), so every
 * status pairs a distinct `lucide-react` icon shape with a distinct color AND a text label.
 * The label is what carries the information once both are stripped; the icon+color are a
 * fast visual shortcut on top, not the only channel.
 */
import { BadgeCheck, Circle, Clock, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WordStatus } from '@/types/progress.ts'

interface StatusMeta {
  readonly label: string
  readonly icon: LucideIcon
  readonly className: string
}

const STATUS_META: Readonly<Record<WordStatus, StatusMeta>> = {
  new: { label: 'Новое', icon: Circle, className: 'text-muted-foreground' },
  learning: { label: 'Изучаю', icon: Clock, className: 'text-blue-600 dark:text-blue-400' },
  known: { label: 'Знаю', icon: BadgeCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  mastered: {
    label: 'Освоено',
    icon: Sparkles,
    className: 'text-violet-600 dark:text-violet-400',
  },
}

export function StatusBadge({ status, className }: { status: WordStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  )
}
