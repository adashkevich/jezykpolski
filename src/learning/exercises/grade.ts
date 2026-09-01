/**
 * `grade` — answer checking (`spec/tasks/09-exercise-engine.md` step 4,
 * `spec/architecture.md` §7.3). A pure function: `Exercise` + the raw string the user typed
 * or picked -> `GradeResult`. No I/O, no `Date.now()`, no randomness.
 *
 * Normalization rules (architecture.md §7.3, task text's table), applied in this order:
 *  1. trim + collapse internal whitespace — always (`będziemy  robić` -> `będziemy robić`).
 *  2. lowercase — always.
 *  3. `ё -> е` — only for Russian-language answers.
 *  4. Polish diacritics are NEVER normalized away for an exact match (`zolty !== żółty`) —
 *     that IS the skill being tested. A diacritic-free answer that otherwise matches is
 *     `nearMiss: true` instead, never silently `correct: true`.
 *  5. any of `accepted` counts (a slot can have several valid spellings, e.g.
 *     `aborcji`/`aborcyj`).
 *  6. for `pl-ru` vocabulary answers, any translation of the sense counts, not just the one
 *     literal string shown as `correct` on a `choice` exercise (that's `input.accepted`
 *     already carrying the full translation list — see `generate.ts`'s `buildVocabInput`).
 */
import { normalizeSearchText } from '@/content/index-store.ts'
import type { Exercise } from './exercise.types.ts'

export interface DiffHint {
  /** The accepted answer this near-miss was matched against — what the UI highlights
   *  differences relative to. */
  readonly expected: string
  /** 0-based character indices into `expected` where it carries a Polish diacritic the
   *  user's answer lacked — enough for the UI to bold/underline exactly those letters. */
  readonly diacriticIndexes: readonly number[]
}

export interface GradeResult {
  readonly correct: boolean
  /** `true` only when the answer would be `correct` after stripping Polish diacritics, but
   *  isn't verbatim — "почти верно", rated `Hard`, never both `correct` and `nearMiss`. */
  readonly nearMiss: boolean
  /** Which entry of the exercise's accepted-answer set this answer matched (verbatim or
   *  near-miss) — absent when nothing matched at all. */
  readonly matched?: string
  readonly diff?: DiffHint
}

// ---------------------------------------------------------------------------
// Whitespace / case / ё normalization.
// ---------------------------------------------------------------------------

function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

type AnswerLanguage = 'pl' | 'ru'

function normalizeForCompare(s: string, lang: AnswerLanguage): string {
  const collapsed = collapseWhitespace(s).toLowerCase()
  return lang === 'ru' ? collapsed.replace(/ё/g, 'е') : collapsed
}

// ---------------------------------------------------------------------------
// Polish diacritic stripping for near-miss detection — reuses `content/index-store.ts`'s
// `normalizeSearchText` (same NFD + explicit `ł` handling it already documents), rather than
// re-implementing the same Unicode dance a second time. That function also lowercases,
// which is harmless here since the near-miss comparison lowercases anyway.
// ---------------------------------------------------------------------------

function stripPolishDiacritics(s: string): string {
  return normalizeSearchText(s)
}

const POLISH_DIACRITIC_CHARS = new Set([
  'ą',
  'ć',
  'ę',
  'ł',
  'ń',
  'ó',
  'ś',
  'ź',
  'ż',
  'Ą',
  'Ć',
  'Ę',
  'Ł',
  'Ń',
  'Ó',
  'Ś',
  'Ź',
  'Ż',
])

function diacriticIndexesOf(s: string): number[] {
  const indexes: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (POLISH_DIACRITIC_CHARS.has(s[i]!)) indexes.push(i)
  }
  return indexes
}

// ---------------------------------------------------------------------------
// Which language the answer is expected in, and what the accepted-answer set is, per
// exercise type. `table`/`matching` don't carry a single accepted-answer set (they're
// composites graded one cell/pair at a time by a future caller, each as its own
// `form-input`/`input`-shaped comparison) — `grade` intentionally refuses them rather than
// guessing.
// ---------------------------------------------------------------------------

function answerLanguage(exercise: Exercise): AnswerLanguage {
  switch (exercise.type) {
    case 'choice':
    case 'input':
      return exercise.direction === 'pl-ru' ? 'ru' : 'pl'
    case 'form-input':
    case 'form-choice':
    case 'self-assess':
      return 'pl'
    case 'table':
    case 'matching':
      throw new Error(
        `grade: exercise type "${exercise.type}" has no single answer language — grade each cell/pair individually`,
      )
  }
}

function acceptedAnswersFor(exercise: Exercise): readonly string[] {
  switch (exercise.type) {
    case 'choice':
    case 'form-choice':
      return [exercise.correct]
    case 'input':
    case 'form-input':
      return exercise.accepted
    case 'self-assess':
      return [exercise.answer]
    case 'table':
    case 'matching':
      throw new Error(
        `grade: exercise type "${exercise.type}" has no single accepted-answer set — grade each cell/pair individually`,
      )
  }
}

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------

export function grade(exercise: Exercise, answer: string): GradeResult {
  const trimmedAnswer = collapseWhitespace(answer)
  if (trimmedAnswer.length === 0) {
    return { correct: false, nearMiss: false }
  }

  const lang = answerLanguage(exercise)
  const accepted = acceptedAnswersFor(exercise)
  const normalizedAnswer = normalizeForCompare(trimmedAnswer, lang)

  for (const candidate of accepted) {
    if (normalizeForCompare(candidate, lang) === normalizedAnswer) {
      return { correct: true, nearMiss: false, matched: candidate }
    }
  }

  // Diacritic-insensitive near-miss only ever applies to Polish answers — Russian ё/е is
  // already folded above, and Russian has no equivalent "typed without diacritics" case.
  if (lang === 'pl') {
    const strippedAnswer = stripPolishDiacritics(normalizedAnswer)
    for (const candidate of accepted) {
      const normalizedCandidate = normalizeForCompare(candidate, lang)
      if (stripPolishDiacritics(normalizedCandidate) === strippedAnswer) {
        return {
          correct: false,
          nearMiss: true,
          matched: candidate,
          diff: { expected: candidate, diacriticIndexes: diacriticIndexesOf(candidate) },
        }
      }
    }
  }

  return { correct: false, nearMiss: false }
}
