/**
 * `InputExercise` component tests (`spec/tasks/12-vocabulary-exercises.md` §4, acceptance
 * criteria 1/3/4/5/6/8/9). Fixtures are real vocabulary (`być|VERB`, `żółty|ADJ` — the exact
 * adjective `spec/architecture.md` §7.3 itself uses for the diacritic near-miss example).
 *
 * `grade()` is used here — in the TEST only — to produce authentic `GradeResult` fixtures
 * (including the near-miss `diff`), never inside `InputExercise.tsx` itself (task rule 2,
 * verified by grep during review — see `ChoiceExercise.test.tsx`'s header comment for why
 * that isn't an RTL-expressible check in this project).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('renders the prompt and a text field that autofocuses', () => {
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

  it('the field disables mobile autocorrect/autocapitalize/spellcheck (task rule 5)', () => {
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('autocapitalize', 'off')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })

  it('submitting with Enter calls onAnswer with the typed value (keyboard-only flow)', async () => {
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

    await user.type(screen.getByRole('textbox'), 'быть{Enter}')

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('быть')
  })

  it('does not call onAnswer for an empty submission', () => {
    const onAnswer = vi.fn()
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={onAnswer}
        feedback={null}
        disabled={false}
      />,
    )
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('shows the Polish diacritics helper only for ru-pl (Polish-typing) direction', () => {
    render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(
      screen.queryByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).not.toBeInTheDocument()
    cleanup()
    render(
      <InputExercise
        exercise={ruPlExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(
      screen.getByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).toBeInTheDocument()
  })

  it('diacritic keys are ≥44px touch targets and insert the character into the field', async () => {
    const user = userEvent.setup()
    render(
      <InputExercise
        exercise={ruPlExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    const zButton = screen.getByRole('button', { name: 'Вставить «ż»' })
    expect(zButton.className).toMatch(/\bsize-11\b/)

    await user.click(zButton)
    expect(screen.getByRole('textbox')).toHaveValue('ż')
  })

  it('nearMiss is its own state — distinct icon + text — never lumped in with "incorrect"', () => {
    // A diacritic-free answer to a Polish-target exercise: grade.ts's own near-miss rule.
    const feedback = grade(ruPlExercise, 'zolty')
    expect(feedback).toMatchObject({ correct: false, nearMiss: true })

    render(
      <InputExercise exercise={ruPlExercise} onAnswer={() => {}} feedback={feedback} disabled />,
    )

    expect(screen.getByText('Почти верно')).toBeInTheDocument()
    expect(screen.queryByText('Неверно')).not.toBeInTheDocument()
    // The differing diacritic character (ż) is highlighted via <mark>.
    expect(screen.getByText('ż', { selector: 'mark' })).toBeInTheDocument()
  })

  it('a genuinely wrong answer renders "Неверно", distinct from nearMiss', () => {
    const feedback = grade(plRuExercise, 'иметь')
    expect(feedback).toMatchObject({ correct: false, nearMiss: false })

    render(
      <InputExercise exercise={plRuExercise} onAnswer={() => {}} feedback={feedback} disabled />,
    )

    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(screen.queryByText('Почти верно')).not.toBeInTheDocument()
  })

  it('a correct answer renders "Верно" and disables the field', () => {
    const feedback = grade(plRuExercise, 'быть')
    expect(feedback.correct).toBe(true)

    render(
      <InputExercise exercise={plRuExercise} onAnswer={() => {}} feedback={feedback} disabled />,
    )

    expect(screen.getByText('Верно')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('resets the field and refocuses when a new question arrives', () => {
    const { rerender } = render(
      <InputExercise
        exercise={plRuExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'быть' } })
    rerender(
      <InputExercise
        exercise={ruPlExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveFocus()
  })
})
