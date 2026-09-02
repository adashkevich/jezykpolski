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
 *
 * `form-input`/`form-choice` (task 18, `spec/tasks/18-noun-exercises.md`) both DO conform to
 * the plain `ExerciseProps<E>` contract (no extra props needed — `FormInputExercise.tsx`/
 * `FormChoiceExercise.tsx` read prompt/slot display straight off `exercise` itself), so they
 * slot in as literal one-line mappings, same as `choice`/`input`. This is also what actually
 * closes the gap task 17 left open: `NounFormsTable`'s cell click already sent a real
 * `targetSkillIds` scope through `/session` (`resolveSkillScope`), and `generateExercise`
 * already produced a `form-choice`/`form-input` instance for it — the only missing piece was
 * a registered component, without which `SessionRunner.tsx`'s `SkippedExerciseNotice`
 * fallback silently skipped the question. `table` is intentionally NOT registered here: it
 * is Practice-only (FR-62, `picker.ts`'s own header: "table... never returned here") and,
 * unlike every other type, is a whole-word multi-cell screen rather than a single
 * one-`onAnswer` question — it does not fit `ExerciseProps<E>` at all (no single "the"
 * answer to report), so it never goes through `SessionRunner`'s queue/registry path. See
 * `features/session-runner/hooks/useTablePracticeSession.ts` and
 * `features/session-runner/components/TableExercise.tsx` for its own, separate entry point.
 */
import type { SrsState } from '@/learning/srs/srs.types.ts'
import { ChoiceExercise } from './ChoiceExercise.tsx'
import { InputExercise } from './InputExercise.tsx'
import { FormInputExercise } from './FormInputExercise.tsx'
import { FormChoiceExercise } from './FormChoiceExercise.tsx'
import { SelfAssessExercise } from './SelfAssessExercise.tsx'
import type {
  ExerciseComponentRegistry,
  ExerciseOfType,
  ExerciseProps,
} from './exercise-props.types.ts'

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
    'form-input': FormInputExercise,
    'form-choice': FormChoiceExercise,
    'self-assess': SelfAssessSlot,
  }
}
