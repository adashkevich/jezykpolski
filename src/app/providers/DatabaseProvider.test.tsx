/**
 * `DatabaseProvider` tests (`spec/tasks/05-persistence.md` acceptance point 8: "Ошибка
 * открытия БД показывает ErrorState, а не падает").
 *
 * Spies on `lifecycle.repository.ts`'s exports rather than importing `db/database.ts`
 * directly — this test file lives outside `src/db/**`, so it's held to the same
 * `no-restricted-imports` rule (acceptance point 7) as any other component/provider.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatabaseProvider } from './DatabaseProvider.tsx'
import * as lifecycle from '@/db/repositories/lifecycle.repository.ts'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await lifecycle.deleteDatabase().catch(() => {})
})

describe('DatabaseProvider', () => {
  it('shows LoadingScreen then renders children once the database opens', async () => {
    render(
      <DatabaseProvider>
        <div>ready-content</div>
      </DatabaseProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('ready-content')).toBeInTheDocument())
  })

  it('shows ErrorState (not a crash) when opening IndexedDB fails', async () => {
    vi.spyOn(lifecycle, 'openDatabase').mockRejectedValue(new Error('simulated open failure'))

    render(
      <DatabaseProvider>
        <div>ready-content</div>
      </DatabaseProvider>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('ready-content')).not.toBeInTheDocument()
    expect(screen.getByText('simulated open failure')).toBeInTheDocument()
    // The heading is now specific to a database failure, not the old (misleading, since this
    // has nothing to do with the dictionary/content layer) hardcoded "Nie udało się załadować
    // słownika" default — see `ErrorState.tsx`'s header.
    expect(screen.getByText('Nie udało się otworzyć lokalnej bazy danych')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /zresetuj lokalną bazę danych/i }),
    ).toBeInTheDocument()
  })

  it('the retry button re-attempts openDatabase without resetting anything', async () => {
    const openSpy = vi
      .spyOn(lifecycle, 'openDatabase')
      .mockRejectedValueOnce(new Error('simulated open failure'))
    const resetSpy = vi.spyOn(lifecycle, 'resetLocalState').mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <DatabaseProvider>
        <div>ready-content</div>
      </DatabaseProvider>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /spróbuj ponownie/i }))

    await waitFor(() => expect(screen.getByText('ready-content')).toBeInTheDocument())
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(resetSpy).not.toHaveBeenCalled()
  })

  it('the reset button calls resetLocalState and then reloads the page', async () => {
    vi.spyOn(lifecycle, 'openDatabase').mockRejectedValue(new Error('simulated open failure'))
    const resetSpy = vi.spyOn(lifecycle, 'resetLocalState').mockResolvedValue(undefined)
    const reloadSpy = vi.fn()
    // jsdom's `window.location.reload` throws "Not implemented" — replace the whole `location`
    // so the click handler's `window.location.reload()` call is observable instead of failing
    // the test.
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    })
    const user = userEvent.setup()

    try {
      render(
        <DatabaseProvider>
          <div>ready-content</div>
        </DatabaseProvider>,
      )

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      await user.click(screen.getByRole('button', { name: /zresetuj lokalną bazę danych/i }))

      await waitFor(() => expect(resetSpy).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1))
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      })
    }
  })
})
