/**
 * `ExerciseFeedback` component tests (`spec/tasks/12-vocabulary-exercises.md` §6, acceptance
 * criteria 3/4/6/7). Feedback fixtures come from the real `grade()` (`@/learning/exercises/
 * grade.ts`) against a real `być|VERB` / `żółty|ADJ` input exercise, not hand-typed
 * `GradeResult` objects.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseFeedback } from './ExerciseFeedback.tsx'
import { grade } from '@/learning/exercises/grade.ts'
import type { ExerciseOfType } from './exercise-props.types.ts'

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

describe('ExerciseFeedback', () => {
  it('correct: "Верно!" with a distinct icon, no "correct answer" line needed', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />)
    expect(screen.getByText('Верно!')).toBeInTheDocument()
    expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument()
  })

  it('incorrect: "Неверно" + the correct answer, distinct from nearMiss', () => {
    const feedback = grade(plRuExercise, 'иметь')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />)
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(screen.queryByText('Почти! Проверь диакритики')).not.toBeInTheDocument()
    expect(screen.getByText('быть')).toBeInTheDocument()
  })

  it('nearMiss: its own state ("Почти! Проверь диакритики"), not "Неверно"', () => {
    const feedback = grade(ruPlExercise, 'zolty')
    expect(feedback.nearMiss).toBe(true)
    render(<ExerciseFeedback feedback={feedback} correctAnswer="żółty" onNext={() => {}} />)

    expect(screen.getByText('Почти! Проверь диакритики')).toBeInTheDocument()
    expect(screen.queryByText('Неверно')).not.toBeInTheDocument()
  })

  // Task 29 (`spec/tasks/29-letter-by-letter-input.md` §4): the old per-character
  // "Ты написал / Правильно" comparison is gone from this panel — that's the letter slots'
  // job now, live, while typing. A clean-but-assisted attempt (a mistake and/or a hint used)
  // still reports `feedback.correct: true`, but gets its own "assisted" status instead of
  // looking identical to a flawless answer.
  it('assisted: "Верно, но с подсказкой" when the typed attempt had a mistake or a hint', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 5 }}
        onNext={() => {}}
      />,
    )

    expect(screen.getByText('Верно, но с подсказкой')).toBeInTheDocument()
    expect(screen.queryByText('Верно!')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ты написал/)).not.toBeInTheDocument()
  })

  it('a clean typed attempt (no mistakes, no hints) still shows the plain "Верно!"', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 0, hintsUsed: 0, revealed: false, letterCount: 5 }}
        onNext={() => {}}
      />,
    )
    expect(screen.getByText('Верно!')).toBeInTheDocument()
  })

  it('the 4 states each use a visually distinct icon shape, not just color (NFR-11)', () => {
    const cases: [ReturnType<typeof grade>, Parameters<typeof ExerciseFeedback>[0]['attempt']][] =
      [
        [grade(plRuExercise, 'быть'), undefined],
        [
          grade(ruPlExercise, 'żółty'),
          { mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 5 },
        ],
        [grade(ruPlExercise, 'zolty'), undefined],
        [grade(plRuExercise, 'иметь'), undefined],
      ]
    const iconClasses = cases.map(([feedback, attempt]) => {
      const { container, unmount } = render(
        <ExerciseFeedback feedback={feedback} correctAnswer="x" attempt={attempt} onNext={() => {}} />,
      )
      const svg = container.querySelector('svg')
      const lucideClass = [...(svg?.classList ?? [])].find(
        (c) => c.startsWith('lucide-') && c !== 'lucide',
      )
      unmount()
      return lucideClass
    })
    expect(new Set(iconClasses).size).toBe(cases.length)
  })

  it('"Далее" is focused automatically and Enter activates it (keyboard-only flow)', async () => {
    const onNext = vi.fn()
    const user = userEvent.setup()
    const feedback = grade(plRuExercise, 'быть')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={onNext} />)

    const nextButton = screen.getByRole('button', { name: 'Далее' })
    expect(nextButton).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('clicking "Далее" calls onNext', async () => {
    const onNext = vi.fn()
    const user = userEvent.setup()
    const feedback = grade(plRuExercise, 'быть')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={onNext} />)

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('every animation utility is gated behind motion-safe: so prefers-reduced-motion disables it', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />)
    const panel = screen.getByRole('status')
    const animationLikeTokens = panel.className
      .split(/\s+/)
      .filter((token) => /animate|fade-in|slide-in|duration-\d/.test(token))
    expect(animationLikeTokens.length).toBeGreaterThan(0)
    for (const token of animationLikeTokens) {
      expect(token.startsWith('motion-safe:')).toBe(true)
    }
  })
})
