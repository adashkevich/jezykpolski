/**
 * `input` exercise — free-text recall (`spec/tasks/12-vocabulary-exercises.md` §4, FR-53,
 * `spec/app-design.md` §6). Since task 28 this is этап 2 of learning a word and always the
 * RU→PL direction (`picker.ts`'s `vocabExerciseType`): показать русский перевод, попросить
 * написать польское слово. The `pl-ru` direction the type still structurally supports is no
 * longer reachable from any queue (FR-52 отменён) — see `spec/tasks/00-progress.md`'s
 * decision log for task 28.
 *
 * Task 29 (`spec/tasks/29-letter-by-letter-input.md`, FR-59/FR-84/FR-85/FR-86): the free-text
 * `<input>` + «Проверить» button is gone. Typing is delegated whole to
 * `LetterSlotsInput` — this component only supplies the prompt and the accepted answers;
 * `LetterSlotsInput` owns the letter-by-letter state machine, the hint/reveal buttons and the
 * Polish diacritics row. `onAnswer` now receives a second argument, the attempt's outcome
 * (mistakes/hints/revealed), which the runner forwards to `submitAnswer` so the rating
 * reflects it instead of always being `Easy`.
 *
 * Still true as before: this component never calls `grade()`, never imports `@/db/**` (task
 * rule 2). `feedback` (a `GradeResult` the runner already computed) is only used here to
 * freeze the field once answered — the correct/assisted/incorrect display itself now lives
 * entirely in `ExerciseFeedback.tsx`.
 */
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'
import { LetterSlotsInput } from './LetterSlotsInput.tsx'

type InputExerciseData = ExerciseOfType<'input'>

export function InputExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<InputExerciseData>) {
  // `grade.ts#answerLanguage`: pl-ru shows a Polish prompt and expects a Russian answer, and
  // vice versa — the diacritics helper only makes sense when the expected answer is Polish
  // (which, since task 28, is every `input` exercise the app actually generates).
  const inputLanguage: 'pl' | 'ru' = exercise.direction === 'pl-ru' ? 'ru' : 'pl'

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-headline-lg font-extrabold break-words text-foreground">
        {exercise.prompt}
      </h2>
      <LetterSlotsInput
        accepted={exercise.accepted}
        showPolishKeys={inputLanguage === 'pl'}
        ariaLabel={inputLanguage === 'pl' ? 'Ответ по-польски' : 'Ответ по-русски'}
        disabled={disabled}
        answered={feedback !== null}
        onComplete={onAnswer}
      />
    </div>
  )
}
