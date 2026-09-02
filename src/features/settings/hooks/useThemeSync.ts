/**
 * Keeps `document.documentElement`'s `.dark`/`.light` classes in sync with the persisted
 * theme setting (`../lib/theme.ts`) — mounted once, app-wide, in `AppProviders.tsx` (task 24
 * addendum to that file — see its own header), so the theme applies on every route, not just
 * while `/settings` happens to be mounted, and updates immediately if changed there
 * (acceptance point 10: "все настройки применяются немедленно").
 *
 * `useLiveQuery` (not a one-shot `useEffect` + `settingsRepo.get`) is what makes "immediately"
 * true even across two different mounted instances of the app reacting to the same change —
 * same convention every other settings-backed live value in this app already uses
 * (`useWordProgressSummary.ts` etc.).
 */
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { THEME_DEFAULT, THEME_SETTING_KEY, applyTheme, type ThemePreference } from '../lib/theme.ts'

/** Renders nothing — `AppProviders.tsx` mounts this purely for its side effect. Returns the
 *  resolved preference (`undefined` until the first settings read resolves) so a caller that
 *  *does* want to render against it (the settings screen itself) doesn't need a second
 *  `useLiveQuery` for the same key. */
export function useThemeSync(): ThemePreference | undefined {
  const theme = useLiveQuery(
    () => settingsRepo.get<ThemePreference>(THEME_SETTING_KEY, THEME_DEFAULT),
    [],
  )

  useEffect(() => {
    if (theme !== undefined) applyTheme(theme)
  }, [theme])

  return theme
}
