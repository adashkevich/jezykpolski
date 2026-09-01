/**
 * `ChoiceExercise` component tests (`spec/tasks/12-vocabulary-exercises.md` §3, acceptance
 * criteria 1/3/6/8/9). Fixture is a real `być|VERB` vocabulary item (`spec/app-design.md` uses
 * exactly this kind of word for its own mockups) rather than invented data.
 *
 * `grade()` is used here — in the TEST only, never inside `ChoiceExercise.tsx` itself (task
 * rule 2 — verified by grep during review, since asserting a module's absent imports isn't
 * expressible as an RTL test without reading source files off disk, which this project's
 * `tsconfig.app.json` deliberately has no Node types for — see
 * `src/learning/exercises/distractors.test.ts`'s own comment on the same constraint) — purely
 * to produce an authentic `GradeResult` fixture instead of a hand-typed one that might not
 * match what `grade.ts` actually returns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChoiceExercise } from './ChoiceExercise.tsx'
import type { ExerciseOfType } from './exercise-props.types.ts'
import { grade } from '@/learning/exercises/grade.ts'

afterEach(() => {
  cleanup()
})

const exercise: ExerciseOfType<'choice'> = {
  type: 'choice',
  direction: 'pl-ru',
  prompt: 'być',
  options: ['быть', 'иметь', 'знать', 'делать'],
  correct: 'быть',
}

describe('ChoiceExercise', () => {
  it('renders the prompt and all 4 options as ≥44px touch targets (NFR-11)', () => {
    render(
      <ChoiceExercise exercise={exercise} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.getByText('być')).toBeInTheDocument()
    for (const option of exercise.options) {
      // `min-h-11` = 2.75rem = 44px in this project's Tailwind scale (same class WordActions.tsx
      // and SearchInput.tsx already use for their own 44px targets) — jsdom has no layout
      // engine to measure real pixels against, so asserting the exact utility class is the
      // right-level check here.
      const button = screen.getByRole('radio', { name: new RegExp(option) })
      expect(button.className).toMatch(/\bmin-h-11\b/)
    }
  })

  it('calls onAnswer with the clicked option text (not an index or the correct answer)', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <ChoiceExercise exercise={exercise} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )

    await user.click(screen.getByRole('radio', { name: /иметь/ }))

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('иметь')
  })

  it('autofocuses the first option on mount so a keyboard-only session can start immediately', () => {
    render(
      <ChoiceExercise exercise={exercise} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.getByRole('radio', { name: /быть/ })).toHaveFocus()
  })

  it('digit keys 1-4 pick the corresponding option (keyboard-only sessions)', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <ChoiceExercise exercise={exercise} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )

    await user.keyboard('3')

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('знать')
  })

  it('does nothing when disabled', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(<ChoiceExercise exercise={exercise} onAnswer={onAnswer} feedback={null} disabled />)

    await user.click(screen.getByRole('radio', { name: /иметь/ }))
    await user.keyboard('1')

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it("marks the correct option and the user's wrong pick with an icon AND text, not color alone (NFR-11)", async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <ChoiceExercise exercise={exercise} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )

    await user.click(screen.getByRole('radio', { name: /иметь/ }))
    const feedback = grade(exercise, 'иметь')
    expect(feedback.correct).toBe(false)
    rerender(
      <ChoiceExercise exercise={exercise} onAnswer={onAnswer} feedback={feedback} disabled />,
    )

    const correctOption = screen.getByRole('radio', { name: /быть/ })
    const wrongPick = screen.getByRole('radio', { name: /иметь/ })

    // Text-based signal, independent of any color/CSS.
    expect(correctOption).toHaveTextContent('Правильный ответ')
    expect(wrongPick).toHaveTextContent('Неверно')
    // Icon-based signal: a distinct svg per state.
    expect(correctOption.querySelector('svg')).toBeInTheDocument()
    expect(wrongPick.querySelector('svg')).toBeInTheDocument()
  })

  it('resets the pick and refocuses the first option when a new question arrives', () => {
    const nextExercise: ExerciseOfType<'choice'> = {
      type: 'choice',
      direction: 'ru-pl',
      prompt: 'иметь',
      options: ['mieć', 'być', 'wiedzieć', 'robić'],
      correct: 'mieć',
    }
    const { rerender } = render(
      <ChoiceExercise exercise={exercise} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    rerender(
      <ChoiceExercise
        exercise={nextExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )

    expect(screen.getByText('иметь')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /mieć/ })).toHaveFocus()
  })
})
