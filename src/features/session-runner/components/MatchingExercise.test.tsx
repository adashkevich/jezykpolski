/**
 * `MatchingExercise` component tests (`spec/tasks/27-context-and-error-analysis.md` §4,
 * FR-55). Pure UI test — this component never touches `@/db/**` itself (grading happens in
 * `useMatchingPracticeSession.ts`, one layer up), so no fake-indexeddb setup is needed here,
 * only `onPairMatched`/`onDone` callback spies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchingExercise } from './MatchingExercise.tsx'
import type { MatchingPairSource } from '../hooks/useMatchingPracticeSession.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const PAIRS: MatchingPairSource[] = [
  { wordId: 'kobieta|NOUN', pl: 'kobieta', ru: 'женщина' },
  { wordId: 'dom|NOUN', pl: 'dom', ru: 'дом' },
]

describe('MatchingExercise', () => {
  it('a correct PL+RU pair click locks both tiles and calls onPairMatched once', async () => {
    const user = userEvent.setup()
    const onPairMatched = vi.fn()
    const onDone = vi.fn()
    render(<MatchingExercise pairs={PAIRS} onPairMatched={onPairMatched} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'женщина' }))

    expect(onPairMatched).toHaveBeenCalledTimes(1)
    expect(onPairMatched).toHaveBeenCalledWith('kobieta|NOUN')
    expect(screen.getByRole('status')).toHaveTextContent('Сопоставлено 1 из 2')
    expect(screen.getByRole('button', { name: 'kobieta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'женщина' })).toBeDisabled()
  })

  it('a wrong PL+RU pair click flashes both tiles, deselects, and never calls onPairMatched', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onPairMatched = vi.fn()
    render(<MatchingExercise pairs={PAIRS} onPairMatched={onPairMatched} onDone={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'дом' }))

    expect(onPairMatched).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'kobieta' })).toHaveAttribute('aria-pressed', 'false')

    vi.useRealTimers()
  })

  it('shows the "Готово" button only once every pair is matched, and it fires onDone', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<MatchingExercise pairs={PAIRS} onPairMatched={vi.fn()} onDone={onDone} />)

    expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'женщина' }))
    await user.click(screen.getByRole('button', { name: 'dom' }))
    await user.click(screen.getByRole('button', { name: 'дом' }))

    const doneButton = await screen.findByRole('button', { name: 'Готово' })
    await user.click(doneButton)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('clicking an already-selected PL tile again deselects it', async () => {
    const user = userEvent.setup()
    render(<MatchingExercise pairs={PAIRS} onPairMatched={vi.fn()} onDone={vi.fn()} />)

    const kobietaTile = screen.getByRole('button', { name: 'kobieta' })
    await user.click(kobietaTile)
    expect(kobietaTile).toHaveAttribute('aria-pressed', 'true')
    await user.click(kobietaTile)
    expect(kobietaTile).toHaveAttribute('aria-pressed', 'false')
  })
})
