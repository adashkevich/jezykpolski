/**
 * "Шапка" — `spec/tasks/08-word-detail.md` §1, FR-40:
 *
 * ```text
 * mieć
 * VERB · A1 · частота #5
 * иметь
 * ```
 *
 * Gender (NOUN only, app-design.md §4's `człowiek` example: "NOUN masculine_personal A1")
 * is deliberately NOT fetched for — it only appears once `paradigm` is handed in non-`null`,
 * i.e. after the user has expanded "Формы слова" at least once (acceptance point 9: the
 * paradigm must not load just to open this page). Before that, the header simply omits it —
 * a smaller deviation from the app-design mockup than fetching a ~15 KB gz shard up front
 * for every NOUN card would be; see this task's decision log for the full reasoning.
 */
import type { PosValue } from '@/content/codec.ts'
import { GENDER_LABELS } from '@/learning/skills/dimensions.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'

const POS_FULL_LABEL: Readonly<Record<PosValue, string>> = {
  NOUN: 'Существительное',
  VERB: 'Глагол',
  ADJ: 'Прилагательное',
  ADV: 'Наречие',
}

/**
 * The gender to show in the header, once `paradigm` is available.
 *  - `paradigm.dominantGender` (task 02) is used as-is for the ~202 NOUN paradigms whose
 *    forms mix more than one gender — never recomputed here.
 *  - For every other NOUN paradigm `dominantGender` is `undefined` by construction (task 02
 *    only sets it when there IS a mix), but every form still agrees on a single `gender` —
 *    reading that one already-uniform value off the first form that has one is not an
 *    alternate "which gender wins" algorithm (there is nothing to arbitrate), just looking
 *    up the one value that is already there.
 */
function resolveHeaderGender(paradigm: Paradigm) {
  if (paradigm.dominantGender) return paradigm.dominantGender
  return paradigm.forms.find((f) => f.gender !== undefined)?.gender
}

export function WordHeader({
  entry,
  primaryTranslation,
  paradigm,
}: {
  entry: WordIndexEntry
  primaryTranslation: string
  /** `undefined` (not loaded yet) or `null` (word has no paradigm) — gender is omitted in
   *  both cases, only rendered once a real `Paradigm` is in hand. */
  paradigm: Paradigm | null | undefined
}) {
  const gender = entry.pos === 'NOUN' && paradigm ? resolveHeaderGender(paradigm) : undefined

  return (
    <header className="flex flex-col gap-3">
      {/* Lexical tag pills (DESIGN.md §5): level in carmine tint, grammar in blue tint,
          frequency in neutral slate. */}
      <div className="flex flex-wrap items-center gap-1.5 text-label-md font-semibold">
        <span className="rounded-md bg-primary-soft px-2 py-1 text-primary-strong">
          {entry.level}
        </span>
        <span className="rounded-md bg-info-soft px-2 py-1 text-info">
          {POS_FULL_LABEL[entry.pos]}
        </span>
        {gender && (
          <span className="rounded-md bg-info-soft px-2 py-1 text-info">
            {GENDER_LABELS[gender].pl} ({GENDER_LABELS[gender].ru})
          </span>
        )}
        <span className="tnum rounded-md bg-secondary px-2 py-1 text-muted-foreground first-letter:uppercase">
          частота #{entry.rank}
        </span>
      </div>
      <h1 className="font-heading text-[2.25rem] leading-[2.75rem] font-bold tracking-[-0.02em] text-foreground sm:text-display-lg">
        {entry.lemma}
      </h1>
      <p className="text-headline-md text-foreground">{primaryTranslation}</p>
    </header>
  )
}
