/**
 * Exercise-type selection (`spec/tasks/09-exercise-engine.md` step 2,
 * `spec/tasks/28-two-stage-vocabulary-and-letter-diff.md` §1,
 * `spec/tasks/37-three-stage-vocabulary.md` §1, `spec/architecture.md` §7.2,
 * `spec/app-design.md` §7 "Как строить обучение одного слова" and §18 "Active recall
 * важнее recognition").
 *
 * Two different rules live here, and the split is the whole point of task 28 (widened to a
 * three-way split by task 37):
 *
 *  - **Vocabulary** — the exercise type follows the skill's *dimension*, not its FSRS state
 *    (FR-80): `vocab:pl-ru` and `vocab:ru-pl-choice` are always `choice` (этап 1/2,
 *    узнавание: выбрать значение из списка, сначала по-русски, потом по-польски среди
 *    польских дистракторов) and `vocab:ru-pl-input` is always `input` (этап 3,
 *    воспроизведение: написать слово по-польски). The progression between them is not a
 *    state machine inside this function at all — it's the three skills' own scheduling: a
 *    later stage doesn't even exist as a `SkillRecord` until
 *    `progress/stage.ts#shouldUnlockCuedRecall` / `shouldUnlockProduction` says the previous
 *    stage cleared its stability bar (`answer-pipeline.ts` materializes it then), which is
 *    what keeps FR-81's "прогрессия не открывается в той же сессии" true without any
 *    sequencing code here.
 *    `PL→RU input` (печатать русский перевод) is deliberately unreachable now — see the
 *    decision log for task 28 in `spec/tasks/00-progress.md`.
 *  - **Morphology** (noun/verb/adj/adv) — unchanged: the recognition/recall pair is still
 *    chosen by the skill's FSRS state, exactly as before task 28.
 *
 * `table` (Practice-only, FR-62) and `matching` are never returned here — the picker only
 * ever chooses between the recognition/recall pair for daily SRS, per the task text's table.
 */
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { SkillRecord, SkillState } from '@/types/progress.ts'

/** The subset of `Exercise['type']` the picker ever selects — recognition or recall, for
 *  vocabulary or morphology, plus the self-assess opt-out for `review`, plus (task 27,
 *  FR-63) `context-sentence` as a recognition-category substitute for `form-choice` on the
 *  4 dimensions `CONTEXT_SENTENCE_ELIGIBLE_CASES` below names. */
export type PickedExerciseType =
  | 'choice'
  | 'input'
  | 'form-choice'
  | 'form-input'
  | 'self-assess'
  | 'context-sentence'

/** The two broad categories `pickExerciseType`'s state-based switch normally chooses
 *  between — `'recognition'` (`choice`/`form-choice`) or `'recall'` (`input`/`form-input`).
 *  Named here for `PickerOptions.forceCategory` (task 19, `spec/tasks/19-practice-mode.md`
 *  §1's "Тип задания" checkboxes, FR-114) — Practice mode lets the user restrict a whole
 *  session to just one of the two, overriding whatever the skill's own SRS state would
 *  otherwise pick. */
export type ExerciseCategory = 'recognition' | 'recall'

export interface PickerOptions {
  /** `state === 'review'` normally picks the recall type (`input`/`form-input`); when this
   *  setting is on, it picks `self-assess` instead (architecture.md §7.2: "review → input
   *  (или self-assess при настройке)"). Off by default — `self-assess` is an explicit
   *  opt-in, not the default review behavior. */
  readonly selfAssessOnReview?: boolean
  /** Task 19's Practice "Тип задания" restriction: when set, the state-based switch below is
   *  skipped entirely — `state`/`reps` are never read — and the result is just "the
   *  recognition (or recall) variant for this skill's kind". `undefined` (every caller
   *  before task 19, and a Practice config where the user left both "Выбор ответа" and
   *  "Ввод ответа" checked) keeps today's normal SRS-state-driven behavior.
   *
   *  Task 28: this only affects **morphological** skills now. A vocab skill's type is fixed
   *  by its dimension (`vocab:pl-ru`/`vocab:ru-pl-choice` -> `choice`, `vocab:ru-pl-input` ->
   *  `input`), so there is nothing left for a category restriction to choose there — forcing
   *  `'recall'` on `vocab:pl-ru` would resurrect the very `PL→RU input` exercise task 28
   *  removed. Both UIs that expose the setting say so (`InterfaceSettingsSection.tsx`,
   *  `TrainingSetupScreen.tsx`: "влияет на упражнения по формам слов"). Task 37's own "Тип
   *  задания" restriction on *vocabulary* is a separate mechanism at the queue level
   *  (`session-scope.ts`'s due-skill filter), not this one — see that module's header. */
  readonly forceCategory?: ExerciseCategory
}

/** `vocab:*` skills use `choice`/`input`; every other `SkillKind` (noun/verb/adj/adv) is
 *  morphology and uses `form-choice`/`form-input` instead. */
function isMorphological(skill: SkillDescriptor): boolean {
  return skill.kind !== 'vocab'
}

/**
 * Task 27 (`spec/tasks/27-context-and-error-analysis.md` §2, FR-63) — the supervisor's
 * literal resolution of that task's own "источник предложений" open question:
 * `content/context-templates.ts`'s bank only covers singular genitive/dative/instrumental/
 * locative (nominative/accusative are already drilled via the bare lemma/`form-choice`
 * elsewhere; plural and every other case are out of this bank's scope). Only these 4
 * dimensions are ever eligible to substitute `context-sentence` for `form-choice` below.
 */
const CONTEXT_SENTENCE_ELIGIBLE_CASES: ReadonlySet<string> = new Set([
  'genitive',
  'dative',
  'instrumental',
  'locative',
])

function isContextSentenceEligible(skill: SkillDescriptor): boolean {
  if (skill.kind !== 'noun') return false
  const parts = skill.dimension.split(':')
  return parts[1] === 'sg' && CONTEXT_SENTENCE_ELIGIBLE_CASES.has(parts[2] ?? '')
}

/** The recognition-category exercise type for one **morphological** skill — `form-choice` as
 *  before, except a `noun:sg:<genitive|dative|instrumental|locative>` skill gets
 *  `context-sentence` instead (task 27 §2's "точка входа": every place the state-based switch
 *  below used to hard-code `'form-choice'` goes through this one function, so the
 *  substitution applies uniformly to `new`, `learning`-with-few-reps, `relearning`, and
 *  `forceCategory: 'recognition'` alike — recall (`form-input`) is untouched, per that task's
 *  explicit instruction). Vocabulary never reaches here since task 28 — see
 *  `vocabExerciseType` below. */
function recognitionType(skill: SkillDescriptor): PickedExerciseType {
  return isContextSentenceEligible(skill) ? 'context-sentence' : 'form-choice'
}

/**
 * Task 28 (FR-80), widened by task 37: a vocabulary skill's exercise type is its dimension,
 * full stop.
 *
 * `vocab:pl-ru` and `vocab:ru-pl-choice` -> `choice` in every SRS state, including `review`:
 * both are recognition stages (RU translation, then the Polish word itself, among
 * distractors — `generate.ts#buildVocabChoice` is symmetric by `direction`) and never become
 * a typing exercise — the typing этап is `vocab:ru-pl-input` alone. `vocab:ru-pl-input` ->
 * `input`, likewise in every state; the one exception is the explicit `selfAssessOnReview`
 * opt-out, which still turns a mature этап-3 skill into `self-assess` (architecture.md §7.2:
 * "review → input (или self-assess при настройке)") — it is off by default and only ever
 * applies to `review`, so the default path is always "write it in Polish".
 */
function vocabExerciseType(
  skill: SkillDescriptor,
  srs: SkillRecord | undefined,
  options: PickerOptions,
): PickedExerciseType {
  if (skill.dimension !== 'vocab:ru-pl-input') return 'choice'
  if (options.selfAssessOnReview && srs?.state === 'review') return 'self-assess'
  return 'input'
}

/**
 * `srs === undefined` means the skill has never been materialized (architecture.md §5.2's
 * lazy materialization — most `SkillDescriptor`s never get a `SkillRecord` row at all) and
 * is treated exactly like `state === 'new'`, per the task text's first rule: "skill
 * отсутствует или state='new' → choice".
 */
export function pickExerciseType(
  skill: SkillDescriptor,
  srs: SkillRecord | undefined,
  options: PickerOptions = {},
): PickedExerciseType {
  // Task 28: vocabulary is decided by direction alone and never consults `state`/`reps`/
  // `forceCategory` — everything below this line is the morphology rule.
  if (!isMorphological(skill)) return vocabExerciseType(skill, srs, options)

  if (options.forceCategory) {
    return options.forceCategory === 'recognition' ? recognitionType(skill) : 'form-input'
  }

  const state: SkillState = srs?.state ?? 'new'
  const reps = srs?.reps ?? 0

  switch (state) {
    case 'new':
      return recognitionType(skill)

    case 'learning':
      if (reps < 2) return recognitionType(skill)
      return 'form-input'

    case 'review':
      if (options.selfAssessOnReview) return 'self-assess'
      return 'form-input'

    case 'relearning':
      // "мягкий возврат после провала" — back to recognition, same as 'new'.
      return recognitionType(skill)
  }
}
