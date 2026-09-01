/**
 * Shared prop contract for every vocabulary exercise component
 * (`spec/tasks/12-vocabulary-exercises.md` §1). Copied verbatim from the task text:
 *
 * ```ts
 * interface ExerciseProps<E extends Exercise> {
 *   exercise: E;
 *   onAnswer(answer: string): void;   // runner сам вызовет grade
 *   feedback: GradeResult | null;     // null = ещё не отвечено
 *   disabled: boolean;
 * }
 * ```
 *
 * A component implementing this contract only ever *collects* an answer and *displays* a
 * `GradeResult` it was handed — it never calls `grade()` (`@/learning/exercises/grade.ts`,
 * task 09) and never imports `@/db/**` (task 05). Checking the answer and persisting the
 * result is the future session runner's job (task 13, not built by this task) — see this
 * task's own decision log for why a compile-time `Record<Exercise['type'], ...>` registry
 * lives here too instead of an actual runner component.
 */
import type { ComponentType } from 'react'
import type { Exercise } from '@/learning/exercises/exercise.types.ts'
import type { GradeResult } from '@/learning/exercises/grade.ts'

export interface ExerciseProps<E extends Exercise> {
  readonly exercise: E
  /** Called once with the raw string the user picked/typed. The runner (task 13) is the one
   *  that turns this into a `GradeResult` via `grade()` and feeds it back as `feedback`. */
  onAnswer(answer: string): void
  /** `null` before the current question has been answered; the `GradeResult` `grade()`
   *  produced once it has. */
  readonly feedback: GradeResult | null
  readonly disabled: boolean
}

/** Narrows the `Exercise` union to one variant by its `type` tag — used below and by the
 *  individual exercise components' own prop types. */
export type ExerciseOfType<T extends Exercise['type']> = Extract<Exercise, { type: T }>

/**
 * Type-only documentation of the registry `spec/architecture.md` §7.1 describes
 * ("`SessionRunner` рендерит по `exercise.type` через реестр компонентов") — NOT a built
 * component. Only the 3 MVP types this task implements are required keys; the other 4
 * (`form-input`, `form-choice`, `table`, `matching`) are optional because their components
 * don't exist yet (`matching` is explicitly deferred past this task — task text §2).
 * A future task 13 can use this shape directly: `const registry: ExerciseComponentRegistry =
 * { choice: ChoiceExercise, input: InputExercise, 'self-assess': SelfAssessExercise, ... }`.
 */
export type ExerciseComponentRegistry = {
  choice: ComponentType<ExerciseProps<ExerciseOfType<'choice'>>>
  input: ComponentType<ExerciseProps<ExerciseOfType<'input'>>>
  'self-assess': ComponentType<ExerciseProps<ExerciseOfType<'self-assess'>>>
} & Partial<{
  [T in Exclude<Exercise['type'], 'choice' | 'input' | 'self-assess'>]: ComponentType<
    ExerciseProps<ExerciseOfType<T>>
  >
}>
