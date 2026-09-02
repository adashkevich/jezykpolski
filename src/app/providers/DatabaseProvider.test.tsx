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
    expect(
      screen.getByRole('button', { name: /zresetuj lokalną bazę danych/i }),
    ).toBeInTheDocument()
  })

  it('the reset button calls deleteDatabase and retries opening', async () => {
    const openSpy = vi
      .spyOn(lifecycle, 'openDatabase')
      .mockRejectedValueOnce(new Error('simulated open failure'))
    const deleteSpy = vi.spyOn(lifecycle, 'deleteDatabase').mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <DatabaseProvider>
        <div>ready-content</div>
      </DatabaseProvider>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /zresetuj lokalną bazę danych/i }))

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('ready-content')).toBeInTheDocument())
    expect(openSpy).toHaveBeenCalledTimes(2)
  })
})
