/**
 * `FormInputExercise` component tests (`spec/tasks/18-noun-exercises.md` steps 1/2/6,
 * FR-60/FR-61). Same rendering/interaction contract as `InputExercise.test.tsx` (task 12) —
 * see that file's header for why `grade()` only appears in fixtures here, never inside the
 * component itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('FormInputExercise — answer collection (mirrors InputExercise)', () => {
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

  it('submitting with Enter calls onAnswer with the typed value', async () => {
    const onAnswer = vi.fn()
    const user = userEvent.setup()
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    await user.type(screen.getByRole('textbox'), 'kobiety{Enter}')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('kobiety')
  })

  it('does not call onAnswer for an empty submission', () => {
    const onAnswer = vi.fn()
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={onAnswer} feedback={null} disabled={false} />,
    )
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('shows the Polish diacritics quick-insert helper', async () => {
    const user = userEvent.setup()
    render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    const lButton = screen.getByRole('button', { name: 'Вставить «ł»' })
    await user.click(lButton)
    expect(screen.getByRole('textbox')).toHaveValue('ł')
  })

  it('nearMiss (diacritic-free answer) is its own state, distinct from "Неверно"', () => {
    const zoltyExercise: ExerciseOfType<'form-input'> = {
      type: 'form-input',
      lemma: 'żółty',
      hint: 'жёлтый',
      promptMode: 'lemma',
      slot: 'adj:degree:positive',
      accepted: ['żółty'],
    }
    const feedback = grade(zoltyExercise, 'zolty')
    expect(feedback).toMatchObject({ correct: false, nearMiss: true })

    render(
      <FormInputExercise exercise={zoltyExercise} onAnswer={() => {}} feedback={feedback} disabled />,
    )
    expect(screen.getByText('Почти верно')).toBeInTheDocument()
    expect(screen.queryByText('Неверно')).not.toBeInTheDocument()
  })

  it('resets the field and refocuses on a new question', () => {
    const { rerender } = render(
      <FormInputExercise exercise={lemmaPrompt} onAnswer={() => {}} feedback={null} disabled={false} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kobiety' } })
    rerender(
      <FormInputExercise
        exercise={translationPrompt}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
      />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveFocus()
  })
})
