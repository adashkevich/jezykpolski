/**
 * The registry `spec/architecture.md` §7.1 / `spec/tasks/13-session-runner.md` §3/rule 8
 * describe: `SessionRunner` renders by `exercise.type` through a
 * `Record<Exercise['type'], ComponentType<...>>`, so adding a new exercise type is "register
 * one more line here", never a `SessionRunner.tsx` edit. `exercise-props.types.ts` (task 12)
 * already declared the exact `ExerciseComponentRegistry` shape this fills in.
 *
 * Built as a *factory* (`createExerciseComponentRegistry`), not a static module-level
 * object, for one reason: `SelfAssessExercise` (task 12) deliberately does not conform to
 * the shared `ExerciseProps<E>` contract on its own — its own file header documents why it
 * additionally needs `srsState`/`now` (`previewIntervals()` needs the skill's *current* FSRS
 * state, which isn't part of the `Exercise` union). Changing that component isn't this
 * task's job (task 12 is done). Rather than widening `ExerciseComponentRegistry` itself
 * (touching a file task 12 owns) or falling back to an untyped `switch` in `SessionRunner`
 * (which rule 8 rules out), the factory closes over the current item's `srsState`/`now` and
 * hands back a tiny wrapper component for the `'self-assess'` slot — that wrapper's own type
 * *is* exactly `ComponentType<ExerciseProps<ExerciseOfType<'self-assess'>>>`, so the
 * resulting object satisfies `ExerciseComponentRegistry` without any cast. Every other slot
 * (`choice`/`input`, and any future type whose component already matches `ExerciseProps<E>`
 * exactly) is still the literal one-line mapping rule 8 asks for.
 */
import type { SrsState } from '@/learning/srs/srs.types.ts'
import { ChoiceExercise } from './ChoiceExercise.tsx'
import { InputExercise } from './InputExercise.tsx'
import { SelfAssessExercise } from './SelfAssessExercise.tsx'
import type { ExerciseComponentRegistry, ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'

export function createExerciseComponentRegistry(current: {
  readonly srsState: SrsState
  readonly now: number
}): ExerciseComponentRegistry {
  function SelfAssessSlot(props: ExerciseProps<ExerciseOfType<'self-assess'>>) {
    return <SelfAssessExercise {...props} srsState={current.srsState} now={current.now} />
  }

  return {
    choice: ChoiceExercise,
    input: InputExercise,
    'self-assess': SelfAssessSlot,
  }
}
