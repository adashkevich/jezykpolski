/**
 * `MatchingExercise` component tests (`spec/tasks/27-context-and-error-analysis.md` §4,
 * FR-55). Pure UI test — this component never touches `@/db/**` itself (grading happens in
 * `useMatchingPracticeSession.ts`, one layer up), so no fake-indexeddb setup is needed here,
 * only `onPairMatched`/`onDone` callback spies.
 *
 * Task 44 (`spec/tasks/44-matching-credit-all-but-mistaken.md`) — `onPairMatched` gets
 * `{ graded }` as a second argument: `false` for a word whose PL or RU tile ever took part
 * in a wrong pairing (a "tainted" word), `true` otherwise. Rule tests below drive it with
 * a 3-pair batch so a mistake between two words leaves a third untouched.
 */
import { act } from 'react'
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

const A = 'kobieta|NOUN'
const B = 'dom|NOUN'
const C = 'kot|NOUN'

const PAIRS3: MatchingPairSource[] = [
  { wordId: A, pl: 'kobieta', ru: 'женщина' },
  { wordId: B, pl: 'dom', ru: 'дом' },
  { wordId: C, pl: 'kot', ru: 'кот' },
]

type User = ReturnType<typeof userEvent.setup>

async function pair(user: User, pl: string, ru: string) {
  await user.click(screen.getByRole('button', { name: pl }))
  await user.click(screen.getByRole('button', { name: ru }))
}

/** Дожидается конца красной вспышки неверной пары (500 мс в компоненте) — пока она идёт,
 *  клики по плиткам игнорируются. */
function endWrongFlash() {
  act(() => {
    vi.advanceTimersByTime(600)
  })
}

/** Последний `graded` по каждому wordId — так тест не зависит от порядка вызовов. */
function gradedByWord(spy: ReturnType<typeof vi.fn>): Map<string, boolean> {
  return new Map(spy.mock.calls.map(([wordId, info]) => [wordId as string, (info as { graded: boolean }).graded]))
}

describe('MatchingExercise', () => {
  it('a correct PL+RU pair click locks both tiles and calls onPairMatched once', async () => {
    const user = userEvent.setup()
    const onPairMatched = vi.fn()
    const onDone = vi.fn()
    render(<MatchingExercise pairs={PAIRS} onPairMatched={onPairMatched} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'женщина' }))

    expect(onPairMatched).toHaveBeenCalledTimes(1)
    expect(onPairMatched).toHaveBeenCalledWith('kobieta|NOUN', { graded: true })
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

  describe('tainted words (task 44)', () => {
    it('a batch with no mistakes reports every pair as graded, including the last two', async () => {
      const user = userEvent.setup()
      const onPairMatched = vi.fn()
      render(<MatchingExercise pairs={PAIRS3} onPairMatched={onPairMatched} onDone={vi.fn()} />)

      await pair(user, 'kobieta', 'женщина')
      await pair(user, 'dom', 'дом')
      await pair(user, 'kot', 'кот')

      expect(onPairMatched.mock.calls).toEqual([
        [A, { graded: true }],
        [B, { graded: true }],
        [C, { graded: true }],
      ])
    })

    it('A_pl -> B_ru mistake taints both A and B, the untouched C is still graded', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const onPairMatched = vi.fn()
      render(<MatchingExercise pairs={PAIRS3} onPairMatched={onPairMatched} onDone={vi.fn()} />)

      await pair(user, 'kobieta', 'дом') // A_pl -> B_ru
      endWrongFlash()
      await pair(user, 'kobieta', 'женщина')
      await pair(user, 'dom', 'дом')
      await pair(user, 'kot', 'кот')

      expect(gradedByWord(onPairMatched)).toEqual(
        new Map([
          [A, false],
          [B, false],
          [C, true],
        ]),
      )
      // Неверная пара сама ничего не сообщает наружу: ровно три вызова — по одному на верную пару.
      expect(onPairMatched).toHaveBeenCalledTimes(3)

      vi.useRealTimers()
    })

    it('taints the word on either side of a wrong pairing — a wrong RU tile alone is enough', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const onPairMatched = vi.fn()
      render(<MatchingExercise pairs={PAIRS3} onPairMatched={onPairMatched} onDone={vi.fn()} />)

      // RU-плитку выбрали первой: C_ru -> A_pl. Запятнаны и C (русская сторона), и A (польская).
      await user.click(screen.getByRole('button', { name: 'кот' }))
      await user.click(screen.getByRole('button', { name: 'kobieta' }))
      endWrongFlash()
      await pair(user, 'dom', 'дом')

      expect(gradedByWord(onPairMatched)).toEqual(new Map([[B, true]]))

      await pair(user, 'kobieta', 'женщина')
      await pair(user, 'kot', 'кот')
      expect(gradedByWord(onPairMatched)).toEqual(
        new Map([
          [A, false],
          [B, true],
          [C, false],
        ]),
      )

      vi.useRealTimers()
    })

    it('repeating a mistake on an already tainted word is harmless (a set, not a counter)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const onPairMatched = vi.fn()
      render(<MatchingExercise pairs={PAIRS3} onPairMatched={onPairMatched} onDone={vi.fn()} />)

      await pair(user, 'kobieta', 'дом') // A, B запятнаны
      endWrongFlash()
      await pair(user, 'kobieta', 'дом') // та же ошибка ещё раз
      endWrongFlash()
      await pair(user, 'kobieta', 'кот') // A запятнан повторно, C — впервые
      endWrongFlash()

      await pair(user, 'kobieta', 'женщина')
      await pair(user, 'dom', 'дом')
      await pair(user, 'kot', 'кот')

      expect(gradedByWord(onPairMatched)).toEqual(
        new Map([
          [A, false],
          [B, false],
          [C, false],
        ]),
      )
      expect(onPairMatched).toHaveBeenCalledTimes(3)
      expect(screen.getByRole('status')).toHaveTextContent('Сопоставлено 3 из 3')

      vi.useRealTimers()
    })
  })
})
