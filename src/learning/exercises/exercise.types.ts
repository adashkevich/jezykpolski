/**
 * Exercise discriminated union (`spec/tasks/09-exercise-engine.md` step 1,
 * `spec/architecture.md` §7.1 — the 7 variants of `Exercise` below are copied verbatim from
 * the architecture doc, not this task's own design).
 *
 * `ExerciseInstance.id` is what makes a question addressable within one session; nothing
 * about `Exercise` itself is session-scoped (`spec/architecture.md` §7.1: "id: uuid, живёт
 * только внутри сессии").
 *
 * Adding an 8th exercise type only touches this union (plus whatever `generate.ts`/`grade.ts`
 * cases it needs) — no consumer keys off anything but `exercise.type`, so a future
 * `SessionRunner` renders via a `Record<Exercise['type'], ComponentType<...>>` registry and
 * never needs its own edit for a new type (task text step 1; verified by this task's own
 * `exercise.types.test.ts`, which encodes the union's exhaustive type list as a compile-time
 * `Record<Exercise['type'], true>`).
 */
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { PosValue } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'

/** Which way translation is being tested: Polish shown / Russian typed-or-picked, or the
 *  reverse. Named `Direction` (not inlined as a bare union) because `spec/tasks/10-distractors.md`
 *  §1 refers to this exact type name in `pickVocabDistractors`'s signature. */
export type Direction = 'pl-ru' | 'ru-pl'

/**
 * Which grammatical slot a `form-input` / `form-choice` / `table` cell targets.
 * `spec/architecture.md` §7.1 names this type `SlotLabel` but never defines it anywhere in
 * the spec tree. This task defines it as an alias of `Dimension`
 * (`learning/skills/dimensions.ts`, task 03/04's `noun:sg:genitive`-shaped strings) — a
 * "slot" the architecture doc refers to IS a dimension; introducing a second, parallel
 * string-union for the same concept would just invite the two to drift apart.
 */
export type SlotLabel = Dimension

/**
 * Which of a form exercise's two word-facing fields (`lemma` vs `hint`) is shown as the
 * *main* prompt (`spec/tasks/18-noun-exercises.md` steps 1-2, `spec/app-design.md` §9/§10's
 * "Вариант A — от польской леммы" / "Вариант B — от русского перевода").
 *
 * Deviation from `spec/architecture.md` §7.1's literal `{ lemma: string; hint: string }`
 * shape, recorded here per this task's own instruction to document it: that shape has no
 * field for "which one is the question and which one is scratch info", yet FR-60/FR-61 are
 * two *different* exercises built from the exact same two facts (a word's Polish lemma and
 * its Russian translation) — the harder one (FR-61) specifically because the lemma is
 * withheld until after the user answers. Adding `promptMode` (rather than renaming/dropping
 * either existing field, which would break every consumer of `exercise.lemma`/`.hint`
 * `spec/architecture.md` §7.1 already promises) keeps both fields present and unambiguous:
 * `lemma` is always the Polish citation form, `hint` is always the primary translation,
 * `promptMode` says which one the UI shows *before* the user answers. The UI component
 * (`FormInputExercise`/`FormChoiceExercise`, `features/session-runner/**`) reveals the other
 * one only after grading — never before, since showing the lemma up front on a Wariant B
 * question would defeat FR-61's entire point ("нужно сначала вспомнить лемму").
 */
export type PromptMode = 'lemma' | 'translation'

/**
 * One cell of a `table` exercise (`spec/tasks/18-noun-exercises.md` step 4 / `spec/app-design.md`
 * §8's case×number grid). `TableCell` is referenced by `spec/architecture.md` §7.1 but never
 * defined there either — this task designs it: the citation row (nominative) is shown
 * pre-filled as an anchor ("Первая строка (Mianownik) предзаполнена как опора" — task
 * 18 step 4), every other cell is a slot the user fills in and that grades independently
 * (task 18 step 5: "в таблице заполненная ячейка обновляет соответствующий навык").
 */
export interface TableCell {
  readonly slot: SlotLabel
  /** `true` for the pre-filled anchor cell — displayed as given, not user-editable/graded. */
  readonly prefilled: boolean
  /** Every valid literal answer for this cell (mirrors `SkillDescriptor.acceptedAnswers` —
   *  task 03's `enumerate.ts` — for the same slot; for a `prefilled` cell this is exactly
   *  the one value shown). */
  readonly accepted: readonly string[]
}

export type Exercise =
  | { type: 'choice'; direction: Direction; prompt: string; options: string[]; correct: string }
  | { type: 'input'; direction: Direction; prompt: string; accepted: string[] }
  | { type: 'self-assess'; prompt: string; answer: string }
  | {
      type: 'form-input'
      lemma: string
      hint: string
      promptMode: PromptMode
      slot: SlotLabel
      accepted: string[]
    }
  | {
      type: 'form-choice'
      lemma: string
      hint: string
      promptMode: PromptMode
      slot: SlotLabel
      options: string[]
      correct: string
    }
  | { type: 'table'; lemma: string; cells: TableCell[] }
  | { type: 'matching'; pairs: Array<{ pl: string; ru: string }> }
  /**
   * Task 27 (`spec/tasks/27-context-and-error-analysis.md` §2, FR-63): "выбери форму,
   * которая нужна в этом предложении" — a `form-choice` sibling whose options are the same
   * kind of thing (other case-forms of ONE word, task 10's `pickFormDistractors` idea) but
   * whose prompt is a fixed-template Polish sentence with a blank (`sentence`, containing a
   * literal `"___"` the UI renders the blank at) instead of a bare lemma + dimension label.
   * `slot` is still a `SlotLabel` (task 09's own `Dimension` alias) for the same reason
   * `form-choice`'s `slot` is — `grade.ts`/`reviewLogs` treat it exactly like any other
   * morphological skill's answer. Only ever generated for `noun:sg:<genitive|dative
   * |instrumental|locative>` (`context-templates.ts`'s own scope) — see `picker.ts`'s
   * eligibility check for exactly which skills route here instead of `form-choice`.
   */
  | { type: 'context-sentence'; sentence: string; slot: SlotLabel; options: string[]; correct: string }
  /**
   * Task 27 §4 (FR-56, "Найди лишний перевод") — Practice-only, never routed through
   * `picker.ts` (see that module's own header: it only ever picks between the SRS
   * recognition/recall pair). `prompt` is a Polish lemma; `options` are 4 Russian words,
   * exactly one of which (`oddIndex`) is NOT a real translation of `prompt` — the other 3
   * are. Deliberately no separate `correct: string` field (unlike `choice`/`form-choice`):
   * the thing being graded is which *option is the odd one out*, not which one matches a
   * single canonical string, so `oddIndex` alone is both the generator's ground truth and
   * `grade.ts`'s accepted-answer key (`options[oddIndex]`).
   */
  | { type: 'odd-one-out'; prompt: string; options: string[]; oddIndex: number }
  /**
   * Task 27 §4 (FR-57, "Быстрая классификация части речи") — Practice-only, same reasoning
   * as `odd-one-out` above. `prompt` is just `lemma` (kept as a distinct field name from
   * `choice`'s `prompt: string` only because every other field here already reads as "the
   * word being asked about", not because the shape differs) with all 4 `POS_VALUES` as the
   * fixed answer set — the UI never needs a stored `options` array for this one, unlike
   * `odd-one-out`, since the option set is always the same 4 constants
   * (`content/codec.ts#POS_VALUES`) regardless of `lemma`.
   */
  | { type: 'pos-classify'; lemma: string; correct: PosValue }

export interface ExerciseInstance {
  /** Deterministic given (skillId, seed) — see `generate.ts`'s decision log for why this is
   *  not `crypto.randomUUID()`. */
  readonly id: string
  readonly skillId: string
  readonly exercise: Exercise
}

/**
 * Thin, synchronous facade over the content-access layer (task 04's `src/content/**`),
 * exactly the interface `spec/tasks/09-exercise-engine.md`'s step 5 requires:
 * "Контент приходит через параметр `ContentContext` (интерфейс, реализуемый слоем 04) —
 * домен не знает про fetch и шарды."
 *
 * `content/senses.ts`'s `getSenses`/`getAllTranslations` and `content/paradigms.ts`'s
 * `getParadigm` are `async` — they may need to fetch a shard the first time a word is
 * touched. `generateExercise` (this task) is deliberately synchronous: it must return the
 * exact same `ExerciseInstance` for the same `(skill, srs, seed)` on every call, including
 * re-renders — an `async` generator would reintroduce a race between "shard still loading"
 * and "user re-rendered the same question", exactly what task 09's determinism acceptance
 * criterion rules out.
 *
 * Resolution: whoever calls `generateExercise` (a future session-runner task) awaits
 * `getSenses`/`getAllTranslations`/`getParadigm` once per skill *before* generating that
 * skill's exercise, then hands `generateExercise` a `ContentContext` whose methods simply
 * read the already-resolved data. This interface is exactly that synchronous read surface —
 * task 04's job is to provide a thin adapter implementing it (thin wrapper, not a
 * reimplementation: e.g. `getPrimaryTranslation`/`getAllTranslations` below have the exact
 * same names and contracts as the real `content/senses.ts` functions they wrap).
 */
export interface ContentContext {
  /** Throws if `wordId` isn't in the index — mirrors `content/senses.ts`'s internal
   *  `requireEntry` contract (a caller passing an unknown `wordId` is a bug, not a normal
   *  "no data" case). */
  getWordEntry(wordId: WordId): WordIndexEntry
  /** Sync mirror of `content/senses.ts`'s `getPrimaryTranslation` (which is itself already
   *  synchronous — the primary translation is inlined in the index). */
  getPrimaryTranslation(wordId: WordId): string
  /** Sync mirror of `content/senses.ts`'s (async) `getAllTranslations`, read from an
   *  already-resolved senses shard. */
  getAllTranslations(wordId: WordId): string[]
  /** Sync mirror of `content/paradigms.ts`'s (async) `getParadigm`, read from an
   *  already-resolved paradigm shard. `null` for the 14 real words with no paradigm at all
   *  (task 04's own contract) — never throws for that case, only for an unknown `wordId`. */
  getParadigm(wordId: WordId): Paradigm | null
}
