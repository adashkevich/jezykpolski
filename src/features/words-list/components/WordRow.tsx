/**
 * One `/words` list row (`spec/tasks/07-words-list.md` §2/§6):
 *
 * ```text
 * być
 * быть
 * VERB · A1 · #1                    [индикатор статуса]
 * ```
 *
 * Rendered as a single `<Link>` (not a `<div>` + onClick) — the acceptance criterion "у
 * строк корректная семантика ссылки" plus plain keyboard operability (Tab focuses it, Enter
 * activates it) come for free from using the real element instead of reimplementing it.
 *
 * `VirtualWordList` gives every row the same fixed pixel height (`WORD_ROW_HEIGHT`,
 * `spec/tasks/07-words-list.md` §1: "проще и быстрее динамической"), so the optional
 * "Формы" bar (FR-46, step 5: appears for NOUN/VERB/ADJ once a specific POS tab is active)
 * cannot change the row's height depending on whether it renders — its track is always
 * present (reserving the same vertical space either empty or filled) and only its fill is
 * conditional.
 */
import { Link } from 'react-router'
import { wordPath } from '@/app/word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { WordProgressRecord } from '@/types/progress.ts'
import { StatusBadge } from './StatusBadge.tsx'

/** Fixed row height in pixels — shared with `VirtualWordList`'s `estimateSize`. */
export const WORD_ROW_HEIGHT = 84

const POS_LABEL: Readonly<Record<PosValue, string>> = {
  NOUN: 'Сущ.',
  VERB: 'Гл.',
  ADJ: 'Прил.',
  ADV: 'Нар.',
}

export function WordRow({
  entry,
  progress,
  showFormsBar,
}: {
  entry: WordIndexEntry
  progress: WordProgressRecord | undefined
  /** Whether the "Формы" (morphology) progress bar should be filled for this row — driven
   *  by the page-level POS tab, not a per-row decision (see file header). */
  showFormsBar: boolean
}) {
  const wordId = encodeWordId(entry.lemma, entry.pos)
  const status = progress?.status ?? 'new'
  const morphPercent = Math.round((progress?.morphMaturity ?? 0) * 100)

  return (
    <Link
      to={wordPath(wordId)}
      className="flex h-full w-full items-center gap-3 border-b border-border px-4 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate leading-tight font-medium text-foreground">{entry.lemma}</div>
        <div className="truncate text-sm leading-tight text-muted-foreground">
          {entry.primaryRu}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{POS_LABEL[entry.pos]}</span>
          <span aria-hidden="true">·</span>
          <span>{entry.level}</span>
          <span aria-hidden="true">·</span>
          <span>#{entry.rank}</span>
        </div>
        <div className="mt-1.5 h-1 max-w-40 overflow-hidden rounded-full bg-muted">
          {showFormsBar && (
            <div
              role="progressbar"
              aria-label={`Формы: ${morphPercent}%`}
              aria-valuenow={morphPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-full rounded-full bg-primary"
              style={{ width: `${morphPercent}%` }}
            />
          )}
        </div>
      </div>
      <StatusBadge status={status} className="shrink-0" />
    </Link>
  )
}
