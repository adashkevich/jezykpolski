/**
 * `OfflineBanner` tests (`spec/tasks/25-offline-update.md` §4).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner.tsx'

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an unobtrusive status line while offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Нет подключения')
  })
})
