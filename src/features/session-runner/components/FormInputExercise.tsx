/**
 * `form-input` exercise — NOUN/VERB/ADJ case/number/etc. free-text recall
 * (`spec/tasks/18-noun-exercises.md` steps 1/2/5/6, FR-60/FR-61). Sibling of
 * `InputExercise.tsx` (task 12), same contract — differs only in what's shown as the
 * prompt; the answer is always Polish (`grade.ts#answerLanguage`'s `form-input` branch is
 * unconditionally `'pl'`, unlike `input`'s direction-dependent language).
 *
 * `exercise.promptMode` (`exercise.types.ts`'s own doc comment) picks which of
 * `exercise.lemma` (Wariant A, FR-60) / `exercise.hint` (Wariant B, FR-61, the primary
 * translation) is shown as the big prompt. The *other* field is intentionally not rendered
 * before an answer is given — showing the lemma up front on a Wariant B question would
 * hand the user the one thing FR-61 is testing ("нужно сначала вспомнить лемму"); it only
 * appears once `feedback` is non-null, as a small "Лемма" / "Перевод" caption alongside the
 * rest of the post-answer state — never before.
 *
 * Slot display (task step 6): the Polish case + number labels are the primary two lines,
 * the Russian glosses trail as one small caption — `describeDimension`
 * (`learning/skills/dimensions.ts`) already resolves both from `exercise.slot` without this
 * component re-deriving case/number parsing itself.
 *
 * Task 29 (`spec/tasks/29-letter-by-letter-input.md`): typing itself — the letter slots,
 * hint/reveal buttons, Polish diacritics row — is delegated whole to `LetterSlotsInput`,
 * same as `InputExercise`. `exercise.accepted` may carry several accepted spellings for one
 * form (e.g. `aborcji`/`aborcyj`) and, for multi-word forms, a space — both handled inside
 * `learning/exercises/letter-attempt.ts`, not here.
 */
import { describeDimension } from '@/learning/skills/dimensions.ts'
import type { ExerciseOfType, ExerciseProps } from './exercise-props.types.ts'
import { LetterSlotsInput } from './LetterSlotsInput.tsx'

type FormInputExerciseData = ExerciseOfType<'form-input'>

export function FormInputExercise({
  exercise,
  onAnswer,
  feedback,
  disabled,
}: ExerciseProps<FormInputExerciseData>) {
  const answered = feedback !== null

  const primaryPrompt = exercise.promptMode === 'lemma' ? exercise.lemma : exercise.hint
  const secondaryPrompt = exercise.promptMode === 'lemma' ? exercise.hint : exercise.lemma
  const secondaryLabel = exercise.promptMode === 'lemma' ? 'Перевод' : 'Лемма'
  const dimension = describeDimension(exercise.slot)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-foreground">{primaryPrompt}</h2>
        {answered && (
          <p className="text-sm text-muted-foreground">
            {secondaryLabel}: {secondaryPrompt}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-base font-medium text-foreground">{dimension.primary.pl}</p>
        {dimension.secondary && (
          <p className="text-base font-medium text-foreground">{dimension.secondary.pl}</p>
        )}
        {dimension.tertiary && (
          <p className="text-base font-medium text-foreground">{dimension.tertiary.pl}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {dimension.primary.ru}
          {dimension.secondary ? `, ${dimension.secondary.ru.toLowerCase()}` : ''}
          {dimension.tertiary ? `, ${dimension.tertiary.ru.toLowerCase()}` : ''}
        </p>
      </div>

      <LetterSlotsInput
        accepted={exercise.accepted}
        showPolishKeys
        ariaLabel="Ответ по-польски"
        disabled={disabled}
        answered={answered}
        onComplete={onAnswer}
      />
    </div>
  )
}
