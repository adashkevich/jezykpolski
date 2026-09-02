/**
 * Exercise-type selection (`spec/tasks/09-exercise-engine.md` step 2,
 * `spec/architecture.md` §7.2, `spec/app-design.md` §7 "Как строить обучение одного слова"
 * and §18 "Active recall важнее recognition").
 *
 * A pure function of skill state, not a scripted "first meeting" scenario: `vocab:pl-ru`
 * and `vocab:ru-pl` are different skills with different `due` (architecture.md §7.2), so
 * the natural spacing app-design §7 asks for ("через несколько минут: RU→PL choice",
 * "завтра: RU→PL input") falls out of the SRS scheduler handing out those two skills at
 * different times — this module never hard-codes a sequence.
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
   *  "Ввод ответа" checked) keeps today's normal SRS-state-driven behavior. */
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

/** The recognition-category exercise type for one skill — `form-choice`/`choice` as before,
 *  except a `noun:sg:<genitive|dative|instrumental|locative>` skill now gets
 *  `context-sentence` instead of `form-choice` (task 27 §2's "точка входа": every place the
 *  state-based switch below used to hard-code `morphological ? 'form-choice' : 'choice'`
 *  now goes through this one function, so the substitution applies uniformly to `new`,
 *  `learning`-with-few-reps, `relearning`, and `forceCategory: 'recognition'` alike — recall
 *  (`form-input`) is untouched, per the task's explicit instruction). */
function recognitionType(skill: SkillDescriptor, morphological: boolean): PickedExerciseType {
  if (!morphological) return 'choice'
  return isContextSentenceEligible(skill) ? 'context-sentence' : 'form-choice'
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
  const morphological = isMorphological(skill)

  if (options.forceCategory) {
    return options.forceCategory === 'recognition'
      ? recognitionType(skill, morphological)
      : morphological
        ? 'form-input'
        : 'input'
  }

  const state: SkillState = srs?.state ?? 'new'
  const reps = srs?.reps ?? 0

  switch (state) {
    case 'new':
      return recognitionType(skill, morphological)

    case 'learning':
      if (reps < 2) return recognitionType(skill, morphological)
      return morphological ? 'form-input' : 'input'

    case 'review':
      if (options.selfAssessOnReview) return 'self-assess'
      return morphological ? 'form-input' : 'input'

    case 'relearning':
      // "мягкий возврат после провала" — back to recognition, same as 'new'.
      return recognitionType(skill, morphological)
  }
}
