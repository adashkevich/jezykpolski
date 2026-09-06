/**
 * `LetterSlotsInput` component tests (`spec/tasks/29-letter-by-letter-input.md` §3-4, FR-59,
 * FR-84, FR-85). This is where the actual keystroke/click behavior that `InputExercise` and
 * `FormInputExercise` both delegate to lives — their own tests only check prompt rendering
 * and prop wiring.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LetterSlotsInput } from './LetterSlotsInput.tsx'

afterEach(() => {
  cleanup()
})

function renderInput(overrides?: Partial<Parameters<typeof LetterSlotsInput>[0]>) {
  const onComplete = vi.fn()
  const view = render(
    <LetterSlotsInput
      accepted={['kotek']}
      showPolishKeys
      ariaLabel="Ответ по-польски"
      disabled={false}
      answered={false}
      onComplete={onComplete}
      {...overrides}
    />,
  )
  return { onComplete, container: view.container }
}

describe('LetterSlotsInput — rendering', () => {
  it('renders one slot per letter and no visible textbox value', () => {
    renderInput({ accepted: ['kotek'] })
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells).toHaveLength(5)
    for (const cell of cells) {
      expect(cell.getAttribute('data-cell-state')).toBe('empty')
    }
  })

  it('the letter row is aria-hidden — a screen reader reads the field value, not letter-by-letter', () => {
    const { container } = renderInput({ accepted: ['kotek'] })
    const hiddenRow = container.querySelector('[aria-hidden="true"]')
    expect(hiddenRow).toBeInTheDocument()
  })

  it('the field autofocuses and disables mobile autocorrect/autocapitalize/spellcheck', () => {
    renderInput()
    const input = screen.getByRole('textbox')
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('autocapitalize', 'off')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })

  it('there is no "Проверить" submit button', () => {
    renderInput()
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
  })

  it('renders separate cells for spaces in a multi-word form', () => {
    renderInput({ accepted: ['a b'] })
    expect(document.querySelectorAll('[data-cell-state]')).toHaveLength(2)
  })
})

describe('LetterSlotsInput — typing', () => {
  it('a correct letter turns its slot correct and advances the cursor', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'k')
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('correct')
    expect(cells[0]!.textContent).toBe('k')
  })

  it('an incorrect letter marks the slot wrong and the cursor does not advance', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'z')
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('wrong')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('empty')
  })

  it('the next keystroke replaces a wrong letter instead of appending after it', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'zk')
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('corrected')
    expect(cells[0]!.textContent).toBe('k')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('empty')
  })

  it('typing all letters correctly calls onComplete with the word and a clean outcome, with no submit button ever needed', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'kot')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('kot', {
      mistakes: 0,
      hintsUsed: 0,
      revealed: false,
      letterCount: 3,
    })
  })

  it('onComplete outcome reflects a mistake made along the way', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'zkot')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('kot', {
      mistakes: 1,
      hintsUsed: 0,
      revealed: false,
      letterCount: 3,
    })
  })
})

describe('LetterSlotsInput — diacritics helper', () => {
  it('inserts the character without losing focus from the field', async () => {
    renderInput({ accepted: ['żaba'] })
    const button = screen.getByRole('button', { name: 'Вставить «ż»' })
    await userEvent.setup().click(button)
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('correct')
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('is a ≥44px touch target', () => {
    renderInput({ accepted: ['żaba'] })
    const button = screen.getByRole('button', { name: 'Вставить «ż»' })
    expect(button.className).toMatch(/\bsize-11\b/)
  })

  it('is hidden when showPolishKeys is false', () => {
    renderInput({ accepted: ['быть'], showPolishKeys: false })
    expect(
      screen.queryByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).not.toBeInTheDocument()
  })
})

describe('LetterSlotsInput — подсказка (hint)', () => {
  it('fills in only the current letter and marks it hinted', async () => {
    renderInput({ accepted: ['kot'] })
    await userEvent.setup().click(screen.getByRole('button', { name: /Подсказка/ }))
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('hinted')
    expect(cells[0]!.textContent).toBe('k')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('empty')
  })

  it('hinting the last letter calls onComplete with hintsUsed reflected', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['no'] })
    await user.type(screen.getByRole('textbox'), 'n')
    await user.click(screen.getByRole('button', { name: /Подсказка/ }))
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('no', {
      mistakes: 0,
      hintsUsed: 1,
      revealed: false,
      letterCount: 2,
    })
  })
})

describe('LetterSlotsInput — «Показать слово» (reveal)', () => {
  it('reveals every remaining letter and calls onComplete immediately, without any typing', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['kotek'] })
    await user.click(screen.getByRole('button', { name: 'Показать слово' }))

    const cells = document.querySelectorAll('[data-cell-state]')
    for (const cell of cells) {
      expect(cell.getAttribute('data-cell-state')).toBe('revealed')
    }
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('', {
      mistakes: 0,
      hintsUsed: 0,
      revealed: true,
      letterCount: 5,
    })
  })

  it('letters already typed correctly stay correct, not revealed, and are kept in the submitted prefix', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['kotek'] })
    await user.type(screen.getByRole('textbox'), 'ko')
    await user.click(screen.getByRole('button', { name: 'Показать слово' }))

    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('correct')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('correct')
    expect(cells[2]!.getAttribute('data-cell-state')).toBe('revealed')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('ko', {
      mistakes: 0,
      hintsUsed: 0,
      revealed: true,
      letterCount: 5,
    })
  })
})

describe('LetterSlotsInput — answered state', () => {
  it('answered=true hides the hint/reveal/diacritics buttons and freezes the field', () => {
    renderInput({ accepted: ['żaba'], answered: true })
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Подсказка/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать слово' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Быстрый ввод польских диакритических знаков' }),
    ).not.toBeInTheDocument()
  })
})
