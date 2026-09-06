/**
 * "Интерфейс" block (`spec/tasks/24-settings-backup.md` §1) — just the theme selector.
 * Writing through `useSetting` is enough to make it apply immediately: `useThemeSync`
 * (mounted app-wide in `AppProviders.tsx`) is a `useLiveQuery` on this exact same key, so it
 * re-applies the `.dark`/`.light` class the instant this `set()` call resolves — no local
 * `applyTheme` call needed here.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { CONTROL_CLASS } from '@/components/ui/control.ts'
import { cn } from '@/lib/utils'
import { useSetting } from '../hooks/useSetting.ts'
import { SettingRow } from './SettingRow.tsx'
import { THEME_DEFAULT, THEME_OPTIONS, THEME_SETTING_KEY, type ThemePreference } from '../lib/theme.ts'

// Same rationale as `LearningSettingsSection.tsx`'s own local `selectClassName` — see
// `SettingRow.tsx`'s header for why this isn't a shared export from that file.
const selectClassName = cn(CONTROL_CLASS, 'h-9 px-2.5')

export function InterfaceSettingsSection() {
  const [theme, setTheme] = useSetting<ThemePreference>(THEME_SETTING_KEY, THEME_DEFAULT)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Интерфейс</CardTitle>
      </CardHeader>
      <CardContent>
        <SettingRow label="Тема">
          <select
            className={selectClassName}
            value={theme ?? THEME_DEFAULT}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
            aria-label="Тема"
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </CardContent>
    </Card>
  )
}
