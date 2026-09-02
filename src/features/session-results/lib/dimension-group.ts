/**
 * Collapses a raw `Dimension` string (`learning/skills/dimensions.ts`) down to the coarser
 * "what grammatical fact is this" grouping key the "Сложнее всего" block on
 * `/session/result` needs (`spec/tasks/14-session-results.md` §1, `spec/app-design.md` §21:
 * "Miejscownik 61% / Dopełniacz 84%" — bare case names, not e.g. "noun:pl:genitive" split
 * apart from "noun:sg:genitive" as two separate rows for the same case).
 *
 * Deliberately its own small string-parsing function rather than reusing
 * `features/word-detail/lib/dimension-breakdown.ts#buildDimensionBreakdown`: that module
 * groups a WORD's full set of `SkillDescriptor`s (every dimension the word's paradigm could
 * ever produce, most never reviewed) into several POS-conditional named sections, which
 * needs live `SkillDescriptor[]`/content data. Here there is no such thing — only whatever
 * `dimension`s actually appear in this one session's `reviewLogs` (`decodeSkillId` already
 * hands one back per log, no content lookup needed) collapsed into ONE flat, cross-POS
 * ranking. Reusing that module would mean synthesizing fake descriptors just to satisfy its
 * signature; a dozen lines of direct string parsing is the simpler, more honest fit.
 *
 * Resolved ambiguity for the decision log: `spec/app-design.md` §21's prose adds "для чисто
 * vocabulary-сессии он группируется по части речи и уровню" — a fallback for the degenerate
 * case where every skill in the session is `vocab:pl-ru`/`vocab:ru-pl` (so grouping by raw
 * dimension collapses to 1-2 rows). The supervisor's task-14 brief overrides this with a
 * flat instruction ("группировка по измерению (dimension из skillId)") and that is what's
 * implemented here — the POS+level fallback needs `WordIndexEntry.level`, which isn't on
 * `ReviewLogRecord` and would require a content-index round trip this screen otherwise never
 * needs. `vocab:pl-ru`/`vocab:ru-pl` are still split into their own two rows below (by
 * translation direction) so a vocab-only session's breakdown isn't completely useless, just
 * not the POS/level grouping the older prose described.
 */
import {
  CASE_LABELS,
  DEGREE_LABELS,
  IMPERATIVE_LABEL,
  TENSE_LABELS,
  type DimensionLabel,
} from '@/learning/skills/dimensions.ts'
import type { CaseValue, DegreeValue, TenseValue } from '@/content/codec.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'

export interface DimensionGroup {
  /** Stable, collision-free grouping key — never shown directly, only used as a Map key. */
  readonly key: string
  readonly label: DimensionLabel
}

const VOCAB_LABELS: Readonly<Record<string, DimensionLabel>> = {
  'vocab:pl-ru': { pl: 'Przekład PL→RU', ru: 'Перевод PL→RU' },
  'vocab:ru-pl': { pl: 'Przekład RU→PL', ru: 'Перевод RU→PL' },
}

// `IMPERATIVE_LABEL` now lives in `learning/skills/dimensions.ts` (added by task 21, which
// needed the exact same "verb:imperative has no TenseValue" label for its own
// `describeDimension` extension) — imported from there instead of duplicated here, so the
// two "Tryb rozkazujący" strings shown across the app can never drift apart.

/**
 * `dimension`'s segments (`"<kind>:<...>"`, `learning/skills/skill-id.ts#decodeSkillId`) tell
 * us which family it belongs to; the grouping key/label only ever needs the semantically
 * meaningful segment (case, degree, tense, or mood), never number/gender — those distinguish
 * individual skills, not "what kind of mistake is this".
 */
export function dimensionGroup(dimension: Dimension): DimensionGroup {
  const parts = dimension.split(':')
  const kind = parts[0]

  if (kind === 'vocab') {
    return { key: dimension, label: VOCAB_LABELS[dimension] ?? { pl: dimension, ru: dimension } }
  }

  if (kind === 'noun') {
    // noun:<sg|pl>:<case>
    const caseValue = parts[2] as CaseValue
    return { key: `case:${caseValue}`, label: CASE_LABELS[caseValue] }
  }

  if (kind === 'adj') {
    if (parts[1] === 'degree') {
      // adj:degree:<degree>
      const degree = parts[2] as DegreeValue
      return { key: `degree:${degree}`, label: DEGREE_LABELS[degree] }
    }
    // adj:<sg|pl>:<gender>:<case>
    const caseValue = parts[3] as CaseValue
    return { key: `case:${caseValue}`, label: CASE_LABELS[caseValue] }
  }

  if (kind === 'adv') {
    // adv:degree:<degree>
    const degree = parts[2] as DegreeValue
    return { key: `degree:${degree}`, label: DEGREE_LABELS[degree] }
  }

  if (kind === 'verb') {
    if (parts[1] === 'imperative') {
      return { key: 'mood:imperative', label: IMPERATIVE_LABEL }
    }
    // verb:<present|future|past>:...
    const tense = parts[1] as TenseValue
    return { key: `tense:${tense}`, label: TENSE_LABELS[tense] }
  }

  // Unreachable for any dimension `enumerate.ts` actually produces — kept as a safe fallback
  // rather than throwing, since this runs against persisted `reviewLogs` data that could in
  // principle outlive a future dimension-namespace change.
  return { key: dimension, label: { pl: dimension, ru: dimension } }
}
