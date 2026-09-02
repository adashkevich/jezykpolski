import type { ReactNode } from 'react'

/** One "label ... control" line inside a settings `Card` — the task text's own mockup
 *  (`spec/tasks/24-settings-backup.md` §1) is laid out as exactly this: a label on the left,
 *  the current value/control on the right. `min-h-11` keeps the row itself a NFR-11 tap
 *  target even when its control is a small `<select>`. */
export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
      <span className="text-sm text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Shared `<select>` styling — copied verbatim from `features/training-setup/components/
 *  TrainingSetupScreen.tsx`'s own `selectClassName` so every dropdown in the app (Practice
 * setup, `/settings`) looks identical rather than each screen inventing its own. */
export const settingSelectClassName =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
