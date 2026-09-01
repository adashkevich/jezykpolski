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
  | { type: 'form-input'; lemma: string; hint: string; slot: SlotLabel; accepted: string[] }
  | {
      type: 'form-choice'
      lemma: string
      hint: string
      slot: SlotLabel
      options: string[]
      correct: string
    }
  | { type: 'table'; lemma: string; cells: TableCell[] }
  | { type: 'matching'; pairs: Array<{ pl: string; ru: string }> }

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
