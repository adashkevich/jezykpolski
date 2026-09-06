/**
 * One collapsible "training block" on `TrainingSetupScreen` (`spec/tasks/32-training-setup-collapsible-blocks.md`
 * §2) — the single reusable carrier of disclosure behavior for every preset block ("Выбор
 * перевода", "Написание по-польски", "Сопоставление") and the forms-drill configurator
 * ("Настроить тренировку форм"), same "один параметризуемый компонент" principle
 * `TrainingSetupScreen.tsx`'s own header already documents for the screen as a whole
 * (FR-113).
 *
 * Native disclosure semantics: the header is a `<button type="button">` carrying
 * `aria-expanded` (always) and `aria-controls` (task text §2's own wording), and the body is
 * a `role="region"` sharing `id` with that `aria-controls` value. The collapsed body is not
 * merely visually hidden — it isn't in the DOM at all (a plain `{open && (...)}`, not a
 * `hidden` attribute), so its controls can never land in the tab order or get flagged by an
 * axe scan of a collapsed screen (task text §2, acceptance point 4).
 *
 * DEVIATION from task text's literal "aria-controls always present": `aria-controls` is only
 * emitted while `open` (i.e. only while the target id actually exists in the DOM). Axe-core's
 * `aria-valid-attr-value` check resolves every `aria-controls` id through
 * `document.getElementById` and fails the whole scan if none of the referenced ids resolve
 * (`node_modules/axe-core/axe.js`'s own `validateAttrValue`/`idrefs` — confirmed by reading
 * that source directly). Since the collapsed body is genuinely absent from the DOM (the
 * requirement immediately above), a permanently-present `aria-controls` pointing at that id
 * would make every collapsed block fail the axe scan the acceptance criteria itself requires
 * to pass in *both* states. Omitting the attribute while collapsed (instead of pointing it at
 * nothing) keeps the relationship advertised whenever it's meaningful and keeps the scan
 * green in both states — the only combination that satisfies both requirements at once.
 */
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TrainingBlockProps {
  /** Stable identifier for this block — also its (conditionally rendered) body's DOM `id`.
   *  Kept stable across renders/sessions: task 33 keys its own "sort by usage" state off it. */
  readonly id: string
  readonly title: string
  /** One line under the title, visible even while collapsed. */
  readonly summary: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly children: ReactNode
}

export function TrainingBlock({ id, title, summary, open, onOpenChange, children }: TrainingBlockProps) {
  const titleId = `${id}-title`

  return (
    <section className="flex flex-col rounded-xl border border-border">
      <button
        type="button"
        id={titleId}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-heading text-base font-medium text-foreground">{title}</span>
          <span className="text-sm text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          id={id}
          role="region"
          aria-labelledby={titleId}
          className="flex flex-col gap-4 border-t border-border p-4"
        >
          {children}
        </div>
      )}
    </section>
  )
}

export default TrainingBlock
