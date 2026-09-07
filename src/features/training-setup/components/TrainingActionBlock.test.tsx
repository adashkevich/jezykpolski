/**
 * `TrainingActionBlock` tests (`spec/tasks/36-practice-screen-restructure.md` §3) — unlike
 * `TrainingBlock.test.tsx` (task 32), there is no disclosure to test: the "Начать" button must
 * be visible immediately, with no `aria-expanded`/`aria-controls` anywhere on the block.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TrainingActionBlock } from './TrainingActionBlock.tsx'

afterEach(() => {
  cleanup()
})

describe('TrainingActionBlock', () => {
  it('renders its title, summary and children with no collapse/expand affordance', () => {
    render(
      <TrainingActionBlock title="Сопоставление" summary="Соедините 5 слов с их переводами.">
        <button type="button" aria-label="Начать: сопоставление">
          Начать
        </button>
      </TrainingActionBlock>,
    )

    expect(screen.getByText('Сопоставление')).toBeInTheDocument()
    expect(screen.getByText('Соедините 5 слов с их переводами.')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Начать: сопоставление' })
    expect(button).toBeVisible()
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})
