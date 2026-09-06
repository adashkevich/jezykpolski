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
 *
 * Task 28 (FR-58): the per-character green/red highlight is NOT computed here. `grade` only
 * reports *which* accepted answer the input should be compared against (`closest`, filled in
 * for the two exercise types where the user actually types); the alignment itself lives in
 * `answer-diff.ts#diffAnswer` and is called by whoever renders it — including the session
 * result screen, which has only two strings out of `reviewLogs` and no `Exercise` at all.
 */
import { normalizeSearchText } from '@/content/index-store.ts'
import { collapseWhitespace, pickClosestExpected } from './answer-diff.ts'
import type { Exercise } from './exercise.types.ts'

export interface GradeResult {
  readonly correct: boolean
  /** `true` only when the answer would be `correct` after stripping Polish diacritics, but
   *  isn't verbatim — "почти верно", rated `Hard`, never both `correct` and `nearMiss`. */
  readonly nearMiss: boolean
  /** Which entry of the exercise's accepted-answer set this answer matched (verbatim or
   *  near-miss) — absent when nothing matched at all. */
  readonly matched?: string
  /** The accepted answer closest to what the user typed (`answer-diff.ts#pickClosestExpected`)
   *  — the string a per-character diff should be rendered against. Present only for the
   *  exercise types where the user types free text (`input`/`form-input`); a `choice`-family
   *  answer has nothing to spell-check. Filled in for correct answers too, so a caller can
   *  render the same green highlight on a fully correct spelling. */
  readonly closest?: string
}

// ---------------------------------------------------------------------------
// Case / ё normalization. Whitespace collapsing itself is `answer-diff.ts`'s
// `collapseWhitespace` — shared so grading and highlighting can never disagree on what the
// two compared strings even are.
// ---------------------------------------------------------------------------

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
    case 'context-sentence':
    case 'pos-classify':
      return 'pl'
    case 'odd-one-out':
      // The 4 options are Russian words (`generate.ts`'s odd-one-out builder pulls them from
      // translations/distractor pools, same source a pl-ru `choice` uses) — graded the same
      // way a pl-ru `choice` answer is.
      return 'ru'
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
    case 'context-sentence':
    case 'pos-classify':
      return [exercise.correct]
    case 'input':
    case 'form-input':
      return exercise.accepted
    case 'self-assess':
      return [exercise.answer]
    case 'odd-one-out':
      // The single "correct" pick is the odd option itself — see this exercise type's own
      // doc comment in `exercise.types.ts` for why there's no separate `correct` field.
      return [exercise.options[exercise.oddIndex]!]
    case 'table':
    case 'matching':
      throw new Error(
        `grade: exercise type "${exercise.type}" has no single accepted-answer set — grade each cell/pair individually`,
      )
  }
}

/** The exercise types whose answer is typed rather than picked — the only ones a
 *  per-character diff (FR-58) means anything for. */
function isTypedAnswer(exercise: Exercise): boolean {
  return exercise.type === 'input' || exercise.type === 'form-input'
}

// ---------------------------------------------------------------------------
// grade
// ---------------------------------------------------------------------------

export function grade(exercise: Exercise, answer: string): GradeResult {
  const trimmedAnswer = collapseWhitespace(answer)
  const accepted = acceptedAnswersFor(exercise)
  // An empty answer still gets a `closest` (the canonical first accepted answer, since every
  // candidate is equally "far" from nothing) so the UI can show the expected spelling with
  // every letter marked missing, instead of a special empty-answer branch of its own.
  const closest = isTypedAnswer(exercise)
    ? { closest: pickClosestExpected(trimmedAnswer, accepted) }
    : {}

  if (trimmedAnswer.length === 0) {
    return { correct: false, nearMiss: false, ...closest }
  }

  const lang = answerLanguage(exercise)
  const normalizedAnswer = normalizeForCompare(trimmedAnswer, lang)

  for (const candidate of accepted) {
    if (normalizeForCompare(candidate, lang) === normalizedAnswer) {
      return { correct: true, nearMiss: false, matched: candidate, ...closest }
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
          // A near-miss matched one specific candidate — the diff must be rendered against
          // *that* one, not against whatever `pickClosestExpected` liked best (they can
          // differ when two accepted spellings are equally close by raw edit distance).
          ...(isTypedAnswer(exercise) ? { closest: candidate } : {}),
        }
      }
    }
  }

  return { correct: false, nearMiss: false, ...closest }
}
