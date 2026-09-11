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

/** Tinted pills per DESIGN.md "Chips & Grammatical Badges": carmine tint for new words, slate
 *  for the learning queue, blue for known, emerald for mastered. Each text/tint pair is
 *  ≥ 4.5:1 (see the palette notes in `globals.css`). */
const STATUS_META: Readonly<Record<WordStatus, StatusMeta>> = {
  new: { label: 'Новое', icon: Circle, className: 'bg-primary-soft text-primary-strong' },
  learning: { label: 'Изучаю', icon: Clock, className: 'bg-surface-high text-[#3c475a]' },
  known: { label: 'Знаю', icon: BadgeCheck, className: 'bg-info-soft text-info' },
  mastered: { label: 'Освоено', icon: Sparkles, className: 'bg-success-soft text-success' },
}

export function StatusBadge({ status, className }: { status: WordStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-label-md font-semibold whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {meta.label}
    </span>
  )
}
