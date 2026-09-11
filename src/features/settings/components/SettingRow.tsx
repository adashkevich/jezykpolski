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

// `settingSelectClassName` used to live here as a plain string constant, but deriving it from
// `CONTROL_CLASS` (task 34, `spec/tasks/34-viewport-zoom-fix.md` §2) makes it a `cn(...)` call
// instead of a literal — `react-refresh/only-export-components`'s `allowConstantExport` only
// exempts literal exports, not computed ones, so a non-component export like that would break
// fast refresh for every file that imports this component. `LearningSettingsSection.tsx` (its
// only consumer since the theme selector was removed — light theme only for now) builds the
// class list locally instead: `cn(CONTROL_CLASS, 'h-9 px-2.5')`.
