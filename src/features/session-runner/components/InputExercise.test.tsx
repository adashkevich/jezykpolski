/**
 * `InputExercise` component tests (`spec/tasks/12-vocabulary-exercises.md` §4,
 * `spec/tasks/29-letter-by-letter-input.md` §5). Since task 29 the component itself is a
 * thin wrapper around `LetterSlotsInput` — the letter-by-letter mechanics (slots, hints,
 * reveal, diacritics) are covered by `LetterSlotsInput.test.tsx`; these tests only check
 * what `InputExercise` itself is responsible for: the prompt, the direction-dependent
 * language/diacritics wiring, and forwarding `onAnswer`/`disabled`/`feedback` correctly.
 *
 * Fixtures are real vocabulary (`być|VERB`, `żółty|ADJ`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputExercise } from './InputExercise.tsx'
import type { ExerciseOfType } from './exercise-props.types.ts'
import { grade } from '@/learning/exercises/grade.ts'

afterEach(() => {
  cleanup()
})

const plRuExercise: ExerciseOfType<'input'> = {
  type: 'input',
  direction: 'pl-ru',
  prompt: 'być',
  accepted: ['быть'],
}

const ruPlExercise: ExerciseOfType<'input'> = {
  type: 'input',
  direction: 'ru-pl',
  prompt: 'жёлтый',
  accepted: ['żółty'],
}

describe('InputExercise', () => {
  it('renders the prompt and an autofocused field', () => {
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByText('być')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('pl-ru direction expects a Russian answer and hides the Polish diacritics row', () => {
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Ответ по-русски')
    expect(
      screen.queryByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).not.toBeInTheDocument()
  })

  it('ru-pl direction (этап 2) expects a Polish answer and shows the diacritics row', () => {
    render(
      <InputExercise
        exercise={ruPlExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Ответ по-польски')
    expect(
      screen.getByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).toBeInTheDocument()
  })

  it('typing the full correct word calls onAnswer with the word and a clean outcome', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={onAnswer}
        feedback={null}
        disabled={false}
      />,
    )

    await user.type(screen.getByRole('textbox'), 'быть')

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('быть', {
      mistakes: 0,
      hintsUsed: 0,
      revealed: false,
      letterCount: 4,
    })
  })

  it('feedback !== null freezes the field (no more editing after an answer)', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(
      <InputExercise exercise={plRuExercise} onAnswer={() => {}} feedback={feedback} disabled />,
    )
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('there is no "Проверить" submit button anymore (task 29 removes it)', () => {
    render(
      <InputExercise
        exercise={ruPlExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
  })
})
