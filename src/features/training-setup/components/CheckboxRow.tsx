/**
 * One checkbox + its clickable label, as a single ≥44px tap target (`spec/tasks/19-practice-mode.md`
 * acceptance point 9, NFR-11) — same convention `features/words-list/components/LevelFilter.tsx`
 * already established (`min-h-11` on the wrapping `<label>`, not just the `<input>` itself).
 */
import type { ReactNode } from 'react'

export function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-foreground select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {children}
    </label>
  )
}
