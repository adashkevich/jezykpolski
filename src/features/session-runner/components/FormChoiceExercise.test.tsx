/**
 * `FormChoiceExercise` component tests (`spec/tasks/18-noun-exercises.md` steps 1/2/3/6,
 * FR-60/FR-61/FR-70). Same rendering/interaction contract as `ChoiceExercise.test.tsx`
 * (task 12) — see that file's header for why `grade()` only appears in fixtures here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormChoiceExercise } from './FormChoiceExercise.tsx'
import type { ExerciseOfType } from './exercise-props.types.ts'
import { grade } from '@/learning/exercises/grade.ts'

afterEach(() => {
  cleanup()
})

const lemmaPrompt: ExerciseOfType<'form-choice'> = {
  type: 'form-choice',
  lemma: 'kobieta',
  hint: 'женщина',
  promptMode: 'lemma',
  slot: 'noun:sg:genitive',
  options: ['kobiety', 'kobiecie', 'kobietę', 'kobietą'],
  correct: 'kobiety',
}

const translationPrompt: ExerciseOfType<'form-choice'> = {
  ...lemmaPrompt,
  promptMode: 'translation',
}

describe('FormChoiceExercise — prompt mode (FR-60/FR-61)', () => {
  it('Wariant A: shows the lemma as prompt, case/number labels PL-primary/RU-small', () => {
    render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.getByText('kobieta')).toBeInTheDocument()
    expect(screen.getByText('Dopełniacz')).toBeInTheDocument()
    expect(screen.getByText('Liczba pojedyncza')).toBeInTheDocument()
  })

  it('Wariant B: shows the translation as prompt, and never leaks the lemma before answering', () => {
    render(
      <FormChoiceExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByText('женщина')).toBeInTheDocument()
    expect(screen.queryByText('kobieta')).not.toBeInTheDocument()
  })

  it('reveals the alternate field only after answering', () => {
    const feedback = grade(translationPrompt, 'kobiety')
    render(
      <FormChoiceExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={feedback}
        disabled
      />,
    )
    expect(screen.getByText(/Лемма: kobieta/)).toBeInTheDocument()
  })
})

describe('FormChoiceExercise — selection (mirrors ChoiceExercise)', () => {
  it('renders every option as a ≥44px touch target, correct answer among them exactly once', () => {
    render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    for (const option of lemmaPrompt.options) {
      const button = screen.getByRole('radio', { name: new RegExp(option) })
      expect(button.className).toMatch(/\bmin-h-11\b/)
    }
    expect(lemmaPrompt.options.filter((o) => o === lemmaPrompt.correct)).toHaveLength(1)
  })

  it('calls onAnswer with the clicked option text', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    await user.click(screen.getByRole('radio', { name: /kobiecie/ }))
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('kobiecie')
  })

  it('autofocuses the first option on mount', () => {
    render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.getByRole('radio', { name: /kobiety/ })).toHaveFocus()
  })

  it('digit keys 1-4 pick the corresponding option', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    await user.keyboard('2')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('kobiecie')
  })

  it("marks the correct option and a wrong pick with icon AND text, not color alone (NFR-11)", async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    await user.click(screen.getByRole('radio', { name: /kobiecie/ }))
    const feedback = grade(lemmaPrompt, 'kobiecie')
    expect(feedback.correct).toBe(false)
    rerender(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={feedback} disabled />,
    )

    const correctOption = screen.getByRole('radio', { name: /kobiety/ })
    const wrongPick = screen.getByRole('radio', { name: /kobiecie/ })
    expect(correctOption).toHaveTextContent('Правильный ответ')
    expect(wrongPick).toHaveTextContent('Неверно')
    expect(correctOption.querySelector('svg')).toBeInTheDocument()
    expect(wrongPick.querySelector('svg')).toBeInTheDocument()
  })

  it('resets the pick and refocuses the first option when a new question arrives', () => {
    const nextExercise: ExerciseOfType<'form-choice'> = {
      type: 'form-choice',
      lemma: 'dom',
      hint: 'дом',
      promptMode: 'lemma',
      slot: 'noun:sg:genitive',
      options: ['domu', 'domem', 'domie'],
      correct: 'domu',
    }
    const { rerender } = render(
      <FormChoiceExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    rerender(
      <FormChoiceExercise
        exercise={nextExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByText('dom')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /domu/ })).toHaveFocus()
  })
})
