/**
 * `SelfAssessExercise` component tests (`spec/tasks/12-vocabulary-exercises.md` §5, acceptance
 * criteria 1/6/8/9). Fixture is `osiągnąć` → `достигнуть`, the exact self-assess example
 * `spec/app-design.md` §6 item 8 uses.
 *
 * `createInitialState`/`previewIntervals` (`@/learning/srs/fsrs-adapter.ts`, task 11) are used
 * to build a real `SrsState` and the exact interval numbers the component is expected to
 * display — asserting against a hand-picked string would silently drift from whatever the FSRS
 * adapter actually computes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelfAssessExercise } from './SelfAssessExercise.tsx'
import type { ExerciseOfType } from './exercise-props.types.ts'
import { createInitialState, previewIntervals } from '@/learning/srs/fsrs-adapter.ts'
import { formatInterval } from '../lib/format-interval.ts'

afterEach(() => {
  cleanup()
})

const NOW = Date.parse('2026-09-01T12:00:00.000Z')

const exercise: ExerciseOfType<'self-assess'> = {
  type: 'self-assess',
  prompt: 'osiągnąć',
  answer: 'достигнуть',
}

function renderExercise(onAnswer = vi.fn()) {
  const srsState = createInitialState(NOW)
  const utils = render(
    <SelfAssessExercise
      exercise={exercise}
      onAnswer={onAnswer}
      feedback={null}
      disabled={false}
      srsState={srsState}
      now={NOW}
    />,
  )
  return { ...utils, onAnswer, srsState }
}

describe('SelfAssessExercise', () => {
  it('phase 1: shows only the prompt and "Показать ответ", not the answer', () => {
    renderExercise()
    expect(screen.getByText('osiągnąć')).toBeInTheDocument()
    expect(screen.queryByText('достигнуть')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать ответ' })).toHaveFocus()
  })

  it('phase 2: reveals the answer and 3 rating buttons showing the real previewIntervals()', async () => {
    const user = userEvent.setup()
    const { srsState } = renderExercise()

    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))

    expect(screen.getByText('достигнуть')).toBeInTheDocument()
    const intervals = previewIntervals(srsState, NOW)
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Не знаю.*${formatInterval(intervals[1])}`, 's'),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Трудно.*${formatInterval(intervals[2])}`, 's'),
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Знаю.*${formatInterval(intervals[3])}`, 's'),
      }),
    ).toBeInTheDocument()
  })

  it('reveal moves focus to the first rating button (keyboard-only session)', async () => {
    const user = userEvent.setup()
    renderExercise()
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))
    expect(screen.getByRole('button', { name: /^Не знаю/ })).toHaveFocus()
  })

  it('clicking a rating button calls onAnswer with the rating as a string, not a translated answer', async () => {
    const user = userEvent.setup()
    const { onAnswer } = renderExercise()
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))

    await user.click(screen.getByRole('button', { name: /^Трудно/ }))

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('2')
  })

  it('rating buttons are ≥44px touch targets (NFR-11)', async () => {
    const user = userEvent.setup()
    renderExercise()
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))
    expect(screen.getByRole('button', { name: /^Знаю/ }).className).toMatch(/\bmin-h-11\b/)
  })

  it('resets to phase 1 and refocuses "Показать ответ" when a new question arrives', () => {
    const nextExercise: ExerciseOfType<'self-assess'> = {
      type: 'self-assess',
      prompt: 'być',
      answer: 'быть',
    }
    const srsState = createInitialState(NOW)
    const { rerender } = render(
      <SelfAssessExercise
        exercise={exercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
        srsState={srsState}
        now={NOW}
      />,
    )
    rerender(
      <SelfAssessExercise
        exercise={nextExercise}
        onAnswer={() => {}}
        feedback={null}
        disabled={false}
        srsState={srsState}
        now={NOW}
      />,
    )
    expect(screen.getByText('być')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать ответ' })).toHaveFocus()
  })
})
