/**
 * Shared base class string for every focusable *text* control (`<input>`/`<select>`) in the
 * app (`spec/tasks/34-viewport-zoom-fix.md` §2) — derived from the three near-identical,
 * independently-hand-copied class strings that predated it: `SearchInput.tsx`'s own inline
 * string, `TrainingSetupScreen.tsx`'s/`FilterSheet.tsx`'s shared `selectClassName`, and
 * `SettingRow.tsx`'s `settingSelectClassName`. All three already agreed on
 * `rounded-lg border border-border bg-background text-foreground outline-none
 * focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` and a `h-11`
 * height (only `SettingRow`'s compact select used `h-9` instead — still overridable via
 * `cn`, see below); they only ever differed in *padding*, which stays each call site's own
 * concern rather than baked in here.
 *
 * `text-base md:text-sm` is the actual bug fix (task 34's root cause): iOS Safari auto-zooms
 * the page when a focused `<input>`/`<select>`/`<textarea>` computes to a `font-size` under
 * 16px, and `text-sm` (14px) is what nearly every control in this app used. 16px by default
 * and 14px again from `md` keeps the previous, denser desktop look pixel-for-pixel — only
 * mobile widths (where the zoom actually fires) render 2px larger.
 *
 * Every consumer composes over this with `cn(CONTROL_CLASS, '...')` — `cn` is `tailwind-merge`-
 * backed (`src/lib/utils.ts`), so a later conflicting utility (a different height, padding, or
 * border color) always wins over what's baked in here; nothing needs to "opt out" of a
 * property it doesn't want.
 */
export const CONTROL_CLASS =
  'h-11 rounded-lg border border-input bg-card text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm'
