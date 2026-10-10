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
  it('correct: no visible panel — "Верно!" is announced to screen readers only', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Верно!')
    expect(status).toHaveClass('sr-only')
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
  // job now, live, while typing. A correct-but-not-flawless attempt still reports
  // `feedback.correct: true`, but gets its own status instead of looking identical to a
  // flawless answer. Task 42 §3 splits that status in two: "с подсказкой" (a hint was used) and
  // "с исправлением" (only a corrected mistake, no hints).
  it('corrected: "Верно, но с исправлением" when the attempt had a mistake and no hints (task 42)', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 5 }}
        onNext={() => {}}
      />,
    )

    expect(screen.getByText('Верно, но с исправлением')).toBeInTheDocument()
    expect(screen.queryByText('Верно, но с подсказкой')).not.toBeInTheDocument()
    expect(screen.queryByText('Верно!')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ты написал/)).not.toBeInTheDocument()
    expect(screen.getByText('Слово вернётся на повторение.')).toBeInTheDocument()
  })

  it('hinted: "Верно, но с подсказкой" when a hint was used (task 42)', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 0, hintsUsed: 2, revealed: false, letterCount: 5 }}
        onNext={() => {}}
      />,
    )

    expect(screen.getByText('Верно, но с подсказкой')).toBeInTheDocument()
    expect(screen.queryByText('Верно, но с исправлением')).not.toBeInTheDocument()
    expect(screen.getByText('Слово вернётся на повторение.')).toBeInTheDocument()
  })

  it('a hint and a mistake in the same attempt: the hint wins (task 42 §3)', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 3, hintsUsed: 1, revealed: false, letterCount: 5 }}
        onNext={() => {}}
      />,
    )

    expect(screen.getByText('Верно, но с подсказкой')).toBeInTheDocument()
    expect(screen.queryByText('Верно, но с исправлением')).not.toBeInTheDocument()
  })

  it('a correct answer that somehow came with a reveal is never labelled "с исправлением" (task 42)', () => {
    const feedback = grade(ruPlExercise, 'żółty')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="żółty"
        attempt={{ mistakes: 0, hintsUsed: 0, revealed: true, letterCount: 5 }}
        onNext={() => {}}
      />,
    )
    expect(screen.queryByText('Верно, но с исправлением')).not.toBeInTheDocument()
    expect(screen.getByText('Верно, но с подсказкой')).toBeInTheDocument()
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

  it('the 4 visible panel states each use a visually distinct icon shape, not just color (NFR-11)', () => {
    const cases: [ReturnType<typeof grade>, Parameters<typeof ExerciseFeedback>[0]['attempt']][] =
      [
        [
          grade(ruPlExercise, 'żółty'),
          { mistakes: 1, hintsUsed: 0, revealed: false, letterCount: 5 },
        ],
        [
          grade(ruPlExercise, 'żółty'),
          { mistakes: 0, hintsUsed: 1, revealed: false, letterCount: 5 },
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

  it('"Знаю" is shown only when onMarkKnown is passed, and clicking it calls it', async () => {
    const onMarkKnown = vi.fn()
    const user = userEvent.setup()
    const feedback = grade(plRuExercise, 'быть')
    const { rerender } = render(
      <ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: 'Знаю' })).not.toBeInTheDocument()

    rerender(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        onNext={() => {}}
        onMarkKnown={onMarkKnown}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Знаю' }))
    expect(onMarkKnown).toHaveBeenCalledOnce()
  })

  // Задача 50 §2: пример primary-значения — строка под статусом, на любом из статусов.
  it.each([
    ['верный ответ', 'быть'],
    ['неверный ответ', 'иметь'],
  ])('%s: пример выводится польской строкой в «…», курсивом', (_name, answer) => {
    const feedback = grade(plRuExercise, answer)
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        example="Anna jest lekarką."
        onNext={() => {}}
      />,
    )
    const example = screen.getByText('«Anna jest lekarką.»')
    expect(example).toHaveAttribute('lang', 'pl')
    expect(example).toHaveClass('italic')
  })

  it('без example (грамматика, matching, детали не успели) строки нет', () => {
    const feedback = grade(plRuExercise, 'иметь')
    render(<ExerciseFeedback feedback={feedback} correctAnswer="быть" onNext={() => {}} />)
    expect(screen.queryByText(/«/)).not.toBeInTheDocument()
  })

  // Задача 51 §3: если известен беларуский/украинский — строка с переводами primary-значения на
  // этот язык (по строке на язык), под правильным ответом и над примером.
  it('неверный ответ, известен украинский: «укр.» и украинский перевод (lang="uk") между ответом и примером', () => {
    const feedback = grade(plRuExercise, 'иметь')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        example="Anna jest lekarką."
        profileTranslations={[{ profile: 'ua', translations: ['бути'] }]}
        onNext={() => {}}
      />,
    )
    expect(screen.getByText('укр.')).toBeInTheDocument()
    const translations = screen.getByText('бути')
    expect(translations).toHaveAttribute('lang', 'uk')

    const answer = screen.getByText('быть', { selector: 'strong' })
    const example = screen.getByText('«Anna jest lekarką.»')
    const follows = (a: Node, b: Node) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(follows(answer, translations)).toBeTruthy()
    expect(follows(translations, example)).toBeTruthy()
  })

  it('верный ответ, известен беларуский: строка «бел.» тоже есть (lang="be")', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        profileTranslations={[{ profile: 'by', translations: ['быць'] }]}
        onNext={() => {}}
      />,
    )
    expect(screen.getByText('бел.')).toBeInTheDocument()
    expect(screen.getByText('быць')).toHaveAttribute('lang', 'be')
  })

  it('известны оба языка: две строки, «бел.» над «укр.»', () => {
    const feedback = grade(plRuExercise, 'быть')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        profileTranslations={[
          { profile: 'by', translations: ['быць'] },
          { profile: 'ua', translations: ['бути'] },
        ]}
        onNext={() => {}}
      />,
    )
    const by = screen.getByText('быць')
    const ua = screen.getByText('бути')
    expect(by).toHaveAttribute('lang', 'be')
    expect(ua).toHaveAttribute('lang', 'uk')
    expect(by.compareDocumentPosition(ua) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('без profileTranslations (только русский, детали не успели) строки нет', () => {
    const feedback = grade(plRuExercise, 'иметь')
    render(
      <ExerciseFeedback
        feedback={feedback}
        correctAnswer="быть"
        example="Anna jest lekarką."
        onNext={() => {}}
      />,
    )
    expect(screen.queryByText('бел.')).not.toBeInTheDocument()
    expect(screen.queryByText('укр.')).not.toBeInTheDocument()
    expect(document.querySelector('[lang="be"], [lang="uk"]')).toBeNull()
  })

  it('every animation utility is gated behind motion-safe: so prefers-reduced-motion disables it', () => {
    const feedback = grade(plRuExercise, 'иметь')
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
