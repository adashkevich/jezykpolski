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
export const TR_CLASS = 'odd:*:bg-surface-low *:first:rounded-l-lg *:last:rounded-r-lg'

export const TH_ROW_CLASS = 'px-3 py-2 text-left align-middle font-semibold text-foreground'

export const CELL_BUTTON_CLASS =
  'flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-high focus-visible:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50'

export const CELL_FORM_CLASS = 'font-semibold text-foreground'

export const CELL_STATE_CLASS = 'text-[10px] leading-none text-muted-foreground'

export const CELL_EMPTY_CLASS = 'px-3 py-2 text-muted-foreground'

export const SEGMENT_TRACK_CLASS = 'flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1'

export const SEGMENT_ITEM_CLASS =
  'flex min-h-10 flex-1 shrink-0 items-center justify-center rounded-lg px-3 text-label-lg whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

export const SEGMENT_ITEM_ACTIVE_CLASS =
  'bg-primary text-primary-foreground shadow-cta hover:text-primary-foreground'

// ---------------------------------------------------------------------------
// NOUN declension list — one column of case rows, `spec/design/word-noun.png`.
// ---------------------------------------------------------------------------

export const DECL_LIST_CLASS = 'flex flex-col gap-1'

export const DECL_ROW_CLASS =
  'flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50'

export const DECL_ROW_TINT_CLASS = 'bg-surface-low'

export const DECL_LABEL_LINE_CLASS = 'flex items-baseline justify-between gap-2'

export const DECL_CASE_CLASS =
  'text-label-sm font-semibold tracking-[0.04em] text-foreground uppercase'

export const DECL_CASE_RU_CLASS =
  'text-label-sm font-semibold tracking-[0.04em] text-foreground uppercase'

export const DECL_QUESTION_CLASS = 'shrink-0 text-label-sm text-muted-foreground'

export const DECL_FORM_LINE_CLASS = 'flex items-baseline justify-between gap-2'

export const DECL_FORM_CLASS = 'text-body-md font-bold break-words text-foreground'

export const DECL_ENDING_CLASS = 'text-primary-strong'

export const DECL_STATE_CLASS = 'shrink-0 text-[10px] leading-none text-muted-foreground'

// ---------------------------------------------------------------------------
// Gender-block list — one card per person/case grouping a handful of gender rows (a small
// "М / Ж / СР" badge + the form), instead of one column per gender. `spec/design/
// word-adjective.png`'s per-case blocks (MIANOWNIK/DOPEŁNIACZ/…) established this pattern;
// VERB's past tense (`VerbFormsTable.tsx`) is the first consumer, but the naming here stays
// generic so a future ADJ redesign can reuse it instead of inventing a second copy.
// ---------------------------------------------------------------------------

export const GENDER_BLOCK_LIST_CLASS = 'flex flex-col gap-2'

export const GENDER_BLOCK_CLASS = 'flex flex-col gap-1.5 rounded-lg bg-surface-low p-3'

export const GENDER_BLOCK_HEADER_CLASS = 'text-label-sm font-semibold tracking-[0.04em] uppercase'

export const GENDER_BLOCK_ROW_CLASS =
  'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50'

export const GENDER_BLOCK_BADGE_CLASS =
  'shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-label-sm font-semibold text-muted-foreground'
