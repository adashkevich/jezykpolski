/**
 * `UpdateBanner` tests (`spec/tasks/25-offline-update.md` §5, NFR-17, acceptance:
 * "Баннер обновления не появляется во время активной сессии").
 *
 * Mocks `virtual:pwa-register/react` itself rather than exercising the real
 * `navigator.serviceWorker` registration path — jsdom has no `serviceWorker` API, so the real
 * hook's `needRefresh` would never flip `true` in a test environment regardless of what this
 * component does with it. This isolates exactly the logic task 25 adds: the session-aware
 * gate and the two button actions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner.tsx'
import { useSessionStore } from '@/stores/session.store.ts'

const state = vi.hoisted(() => ({ needRefresh: false }))
const updateServiceWorkerMock = vi.fn()

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [state.needRefresh, (v: boolean) => (state.needRefresh = v)],
    offlineReady: [false, () => {}],
    updateServiceWorker: updateServiceWorkerMock,
  }),
}))

afterEach(() => {
  cleanup()
  state.needRefresh = false
  updateServiceWorkerMock.mockClear()
  useSessionStore.getState().reset()
})

describe('UpdateBanner', () => {
  it('renders nothing when no update is available', () => {
    render(<UpdateBanner />)
    expect(screen.queryByText('Доступна новая версия')).not.toBeInTheDocument()
  })

  it('shows the banner when an update is available and no session is active', () => {
    state.needRefresh = true
    render(<UpdateBanner />)
    expect(screen.getByText('Доступна новая версия')).toBeInTheDocument()
  })

  it('does not show the banner while a session is active (NFR-17)', () => {
    state.needRefresh = true
    useSessionStore.getState().startSession({ sessionId: 1, mode: 'learn', queue: [] })
    render(<UpdateBanner />)
    expect(screen.queryByText('Доступна новая версия')).not.toBeInTheDocument()
  })

  it('calls updateServiceWorker(true) when "Обновить" is clicked', () => {
    state.needRefresh = true
    render(<UpdateBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true)
  })

  it('hides after "Позже" is clicked, without calling updateServiceWorker', () => {
    state.needRefresh = true
    render(<UpdateBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Позже' }))
    expect(screen.queryByText('Доступна новая версия')).not.toBeInTheDocument()
    expect(updateServiceWorkerMock).not.toHaveBeenCalled()
  })
})
