/**
 * `LetterSlotsInput` component tests (`spec/tasks/29-letter-by-letter-input.md` §3-4, FR-59,
 * FR-84, FR-85; progressive reveal per `spec/tasks/30-progressive-letter-slots.md` §2). This
 * is where the actual keystroke/click behavior that `InputExercise` and `FormInputExercise`
 * both delegate to lives — their own tests only check prompt rendering and prop wiring.
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
  it('renders exactly one empty slot on mount, however long the answer is (progressive reveal, task 30)', () => {
    renderInput({ accepted: ['kotek'] })
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells).toHaveLength(1)
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('empty')
  })

  it('renders exactly one empty slot on mount for a much longer answer too — the DOM never reveals word length up front', () => {
    renderInput({ accepted: ['będziemy robić'] })
    expect(document.querySelectorAll('[data-cell-state]')).toHaveLength(1)
  })

  // Задача 42 §1: 12 букв в строке на 360px без уменьшения шрифта — ячейка 24px (32px от
  // 480px), промежуток 2px, отступ ряда `px-2`. jsdom не считает вёрстку, поэтому проверяем
  // классы; фактическая ширина проверена в браузере (см. отчёт к задаче).
  it('the cell geometry is fixed regardless of word length: w-6 (w-8 from 480px), h-11, same 22px font', () => {
    renderInput({ accepted: ['będziemy robić'] })
    const cell = document.querySelector('[data-cell-state]')!
    expect(cell.className).toMatch(/(^|\s)w-6(\s|$)/)
    expect(cell.className).toMatch(/min-\[480px\]:w-8/)
    expect(cell.className).toMatch(/\bh-11\b/)
    expect(cell.className).toMatch(/\btext-headline-md\b/)
    expect(cell.className).not.toMatch(/\bmin-w-11\b/)
  })

  it('the slot row is gap-0.5 with px-2 padding, and a separator is w-2 wide', async () => {
    const user = userEvent.setup()
    const { container } = renderInput({ accepted: ['a b'] })
    await user.type(screen.getByRole('textbox'), 'a')
    const row = document.querySelector('[data-cell-state]')!.parentElement!
    expect(row.className).toMatch(/\bgap-0\.5\b/)
    expect(row.className).not.toMatch(/\bgap-1\.5\b/)
    expect(row.parentElement!.className).toMatch(/\bpx-2\b/)
    const separator = container.querySelector('[data-cell-state]')!.nextElementSibling!
    expect(separator.className).toMatch(/\bw-2\b/)
  })

  it('the hidden field aria-label never names the letter count', () => {
    renderInput({ accepted: ['kotek'], ariaLabel: 'Ответ по-польски' })
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Ответ по-польски')
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

  it('a separator becomes visible together with the slot of the letter right after it, not before (task 30 §1 p.2)', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['a b'] })
    // Before typing anything, only the first letter's slot is visible — the space and the
    // second word haven't appeared in the DOM at all yet.
    expect(document.querySelectorAll('[data-cell-state]')).toHaveLength(1)

    await user.type(screen.getByRole('textbox'), 'a')
    // Typing the correct first letter reveals the separator *and* the next slot together.
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells).toHaveLength(2)
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('correct')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('empty')
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
  })

  it('an incorrect letter does not add a new slot (task 30 §1 p.3)', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'z')
    expect(document.querySelectorAll('[data-cell-state]')).toHaveLength(1)
  })

  it('backspace erases the wrong letter without ever revealing a slot further out than before it was typed', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'z')
    await user.type(screen.getByRole('textbox'), '{Backspace}')
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells).toHaveLength(1)
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('empty')
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

  // Задача 42 §2: бэкспейс — основной путь исправления на телефоне, он не должен терять
  // подсветку исправления и не должен удваивать счёт ошибки.
  it('wrong letter, backspace, then the right letter: the slot is corrected, not correct (task 42)', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'z{Backspace}k')
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('corrected')
    expect(cells[0]!.textContent).toBe('k')
  })

  it('wrong, backspace, wrong again, then right: one mistake, not two (task 42)', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderInput({ accepted: ['kot'] })
    await user.type(screen.getByRole('textbox'), 'z{Backspace}x{Backspace}kot')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('kot', {
      mistakes: 1,
      hintsUsed: 0,
      revealed: false,
      letterCount: 3,
    })
  })

  it('corrected and hinted slots differ both in color and in underline style (NFR-11, task 42)', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kot'] })
    // slot 0 — corrected (wrong letter, backspace, right letter); slot 1 — hinted.
    await user.type(screen.getByRole('textbox'), 'z{Backspace}k')
    await user.click(screen.getByRole('button', { name: /Подсказка/ }))
    const cells = document.querySelectorAll('[data-cell-state]')
    expect(cells[0]!.getAttribute('data-cell-state')).toBe('corrected')
    expect(cells[1]!.getAttribute('data-cell-state')).toBe('hinted')

    const corrected = cells[0]!.className
    const hinted = cells[1]!.className
    expect(corrected).toMatch(/\btext-warning\b/)
    expect(hinted).toMatch(/\btext-info\b/)
    expect(corrected).not.toMatch(/\btext-info\b/)
    expect(hinted).not.toMatch(/\btext-warning\b/)
    expect(corrected).toMatch(/\bdecoration-solid\b/)
    expect(hinted).toMatch(/\bdecoration-dashed\b/)
    expect(corrected).not.toMatch(/\bdecoration-dashed\b/)
    expect(hinted).not.toMatch(/\bdecoration-solid\b/)
  })

  it('the five non-empty states are pairwise distinguishable by class string (task 42 §2 table)', async () => {
    const user = userEvent.setup()
    renderInput({ accepted: ['kotek'] })
    // correct, corrected, hinted, wrong — and revealed via «Показать слово» below.
    await user.type(screen.getByRole('textbox'), 'k')
    await user.type(screen.getByRole('textbox'), 'z{Backspace}o')
    await user.click(screen.getByRole('button', { name: /Подсказка/ }))
    await user.type(screen.getByRole('textbox'), 'x')
    const classes = new Map<string, string>()
    for (const cell of document.querySelectorAll('[data-cell-state]')) {
      classes.set(cell.getAttribute('data-cell-state')!, cell.className)
    }
    await user.click(screen.getByRole('button', { name: 'Показать слово' }))
    for (const cell of document.querySelectorAll('[data-cell-state]')) {
      classes.set(cell.getAttribute('data-cell-state')!, cell.className)
    }
    expect([...classes.keys()].sort()).toEqual(['correct', 'corrected', 'hinted', 'revealed', 'wrong'].sort())
    expect(new Set(classes.values()).size).toBe(classes.size)
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
    expect(cells).toHaveLength(5)
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
