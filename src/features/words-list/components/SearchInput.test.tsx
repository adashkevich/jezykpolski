/**
 * Debounce behavior for the `/words` search field (`spec/tasks/07-words-list.md` §4: "Debounce
 * 200 мс"). Drives the input via `fireEvent.change` + real timers rather than
 * `userEvent`+fake timers — the two don't compose reliably here (userEvent's internal
 * per-keystroke delay scheduling and vitest's fake timers fight each other and the test
 * hangs), and a real ~200ms wait is cheap enough per test not to matter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { SearchInput } from './SearchInput.tsx'
import { useFiltersStore } from '@/stores/filters.store.ts'

beforeEach(() => {
  useFiltersStore.setState({ search: '' })
})

afterEach(() => {
  cleanup()
})

describe('SearchInput', () => {
  it('does not commit to the store before the 200ms debounce elapses', async () => {
    render(<SearchInput />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kot' } })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(useFiltersStore.getState().search).toBe('')
  })

  it('commits the typed value to the store once the debounce elapses', async () => {
    render(<SearchInput />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kot' } })

    await waitFor(() => expect(useFiltersStore.getState().search).toBe('kot'))
  })

  it('a further keystroke before 200ms resets the debounce window (only the final value commits)', async () => {
    render(<SearchInput />)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'k' } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    fireEvent.change(input, { target: { value: 'kot' } })

    await new Promise((resolve) => setTimeout(resolve, 130))
    // Would already be 'k' if the first keystroke's timer hadn't been cancelled.
    expect(useFiltersStore.getState().search).toBe('')

    await waitFor(() => expect(useFiltersStore.getState().search).toBe('kot'))
  })

  it('the clear button empties the field and (after the debounce) the store', async () => {
    render(<SearchInput />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kot' } })
    await waitFor(() => expect(useFiltersStore.getState().search).toBe('kot'))

    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')

    await waitFor(() => expect(useFiltersStore.getState().search).toBe(''))
  })

  it('reflects an externally-set store value (e.g. filter reset) without needing a debounce', () => {
    render(<SearchInput />)
    act(() => {
      useFiltersStore.getState().setSearch('żółty')
    })
    expect(screen.getByRole('searchbox')).toHaveValue('żółty')
  })
})
