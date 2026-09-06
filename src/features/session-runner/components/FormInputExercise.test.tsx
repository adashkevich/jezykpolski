/**
 * `FormInputExercise` component tests (`spec/tasks/18-noun-exercises.md` steps 1/2/6,
 * FR-60/FR-61). Since task 29 the letter-by-letter input mechanics are shared with
 * `InputExercise` via `LetterSlotsInput` and covered once in `LetterSlotsInput.test.tsx` —
 * these tests only check what `FormInputExercise` itself owns: `promptMode` rendering,
 * `describeDimension` labels, and forwarding to the shared input.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormInputExercise } from './FormInputExercise.tsx'
import type { ExerciseOfType } from './exercise-props.types.ts'
import { grade } from '@/learning/exercises/grade.ts'

afterEach(() => {
  cleanup()
})

const lemmaPrompt: ExerciseOfType<'form-input'> = {
  type: 'form-input',
  lemma: 'kobieta',
  hint: 'женщина',
  promptMode: 'lemma',
  slot: 'noun:sg:genitive',
  accepted: ['kobiety'],
}

const translationPrompt: ExerciseOfType<'form-input'> = {
  type: 'form-input',
  lemma: 'kobieta',
  hint: 'женщина',
  promptMode: 'translation',
  slot: 'noun:pl:instrumental',
  accepted: ['kobietami'],
}

describe('FormInputExercise — Wariant A (lemma prompt, FR-60)', () => {
  it('shows the Polish lemma as the prompt, and the case + number labels PL-primary/RU-small', () => {
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.getByText('kobieta')).toBeInTheDocument()
    expect(screen.getByText('Dopełniacz')).toBeInTheDocument()
    expect(screen.getByText('Liczba pojedyncza')).toBeInTheDocument()
    expect(screen.getByText(/Родительный/)).toBeInTheDocument()
  })

  it('does NOT show the translation before an answer is given', () => {
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.queryByText('женщина')).not.toBeInTheDocument()
  })

  it('reveals the translation as a small caption once answered', () => {
    const feedback = grade(lemmaPrompt, 'kobiety')
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={feedback} disabled />,
    )
    expect(screen.getByText(/Перевод: женщина/)).toBeInTheDocument()
  })
})

describe('FormInputExercise — Wariant B (translation prompt, FR-61)', () => {
  it('shows the Russian translation as the prompt, WITHOUT the Polish lemma anywhere on screen', () => {
    render(
      <FormInputExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByText('женщина')).toBeInTheDocument()
    // The lemma must not leak before the user answers — that's the whole point of FR-61
    // ("нужно сначала вспомнить лемму").
    expect(screen.queryByText('kobieta')).not.toBeInTheDocument()
  })

  it('reveals the lemma as a small caption once answered', () => {
    const feedback = grade(translationPrompt, 'kobietami')
    render(
      <FormInputExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={feedback}
        disabled
      />,
    )
    expect(screen.getByText(/Лемма: kobieta/)).toBeInTheDocument()
  })
})

describe('FormInputExercise — answer collection (delegated to LetterSlotsInput)', () => {
  it('always expects a Polish answer (aria-label), regardless of promptMode', () => {
    render(
      <FormInputExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Ответ по-польски' })).toBeInTheDocument()
  })

  it('shows the Polish diacritics quick-insert helper regardless of promptMode', () => {
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(
      screen.getByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).toBeInTheDocument()
  })

  it('typing the full correct form calls onAnswer with the form and a clean outcome', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    await user.type(screen.getByRole('textbox'), 'kobiety')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('kobiety', {
      mistakes: 0,
      hintsUsed: 0,
      revealed: false,
      letterCount: 7,
    })
  })

  it('feedback !== null freezes the field', () => {
    const feedback = grade(lemmaPrompt, 'kobiety')
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={feedback} disabled />,
    )
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('there is no "Проверить" submit button anymore (task 29 removes it)', () => {
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
  })
})
