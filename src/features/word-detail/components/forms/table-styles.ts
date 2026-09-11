/**
 * Shared class strings for the word-detail declension/conjugation tables and their segmented
 * toggles (`spec/design/word-noun.png` / `word-verb.png` / `word-adjective.png`, DESIGN.md
 * §2 "Segmented Controls" and §4 "Declension & Conjugation Tables"): borderless rows on
 * alternating tonal strips instead of ruled lines, small uppercase column captions, and the
 * inflected form in semibold with tabular figures.
 *
 * Plain string literals in a non-component module, so importing them never trips
 * `react-refresh/only-export-components`.
 */

export const TABLE_CLASS = 'w-full border-separate border-spacing-y-1 text-body-md tnum'

export const TH_COL_CLASS =
  'px-3 pt-1 pb-1.5 text-left text-label-sm font-semibold tracking-[0.06em] text-muted-foreground uppercase'

/** Zebra strip with rounded row ends — `border-separate` lets each cell carry the tint. */
export const TR_CLASS =
  'odd:*:bg-surface-low *:first:rounded-l-lg *:last:rounded-r-lg'

export const TH_ROW_CLASS = 'px-3 py-2 text-left align-middle font-semibold text-foreground'

export const CELL_BUTTON_CLASS =
  'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-high focus-visible:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50'

export const CELL_FORM_CLASS = 'font-semibold text-foreground'

export const CELL_STATE_CLASS = 'text-[10px] leading-none text-muted-foreground'

export const CELL_EMPTY_CLASS = 'px-3 py-2 text-muted-foreground'

export const SEGMENT_TRACK_CLASS = 'flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1'

export const SEGMENT_ITEM_CLASS =
  'flex min-h-10 flex-1 shrink-0 items-center justify-center rounded-lg px-3 text-label-lg whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

export const SEGMENT_ITEM_ACTIVE_CLASS = 'bg-primary text-primary-foreground shadow-cta hover:text-primary-foreground'
