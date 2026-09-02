/**
 * `FormsSection` offline-error-branch tests (`spec/tasks/25-offline-update.md` §7,
 * acceptance: "Формы неоткрытого слова в офлайне дают понятное состояние, а не ошибку").
 *
 * Drives `lazyParadigm` directly (a plain object matching `LazyParadigm`'s shape) rather
 * than going through the real `useLazyParadigm`/`fetch` path — `WordDetailPage.test.tsx`
 * already covers the happy path end-to-end with real fixture data; this file only needs to
 * exercise the two `status === 'error'` branches this task adds, gated on `navigator.onLine`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FormsSection } from './FormsSection.tsx'
import type { LazyParadigm } from '../hooks/useLazyParadigm.ts'

afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

function errorLazyParadigm(message: string): LazyParadigm {
  return {
    status: 'error',
    paradigm: undefined,
    error: new Error(message),
    load: () => {},
  }
}

function renderOpen(lazyParadigm: LazyParadigm) {
  render(
    <MemoryRouter>
      <FormsSection pos="NOUN" wordId="kobieta|NOUN" lazyParadigm={lazyParadigm} skills={undefined} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Формы слова/ }))
}

describe('FormsSection — error branch', () => {
  it('shows the generic retry message while online', () => {
    renderOpen(errorLazyParadigm('HTTP 500'))

    expect(screen.getByText(/Не удалось загрузить формы: HTTP 500/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    expect(screen.queryByText(/недоступны офлайн/)).not.toBeInTheDocument()
  })

  it('shows the offline-specific message with a link to /settings when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    renderOpen(errorLazyParadigm('Failed to fetch'))

    expect(screen.getByText(/Формы недоступны офлайн/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'настройках' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Не удалось загрузить формы/)).not.toBeInTheDocument()
  })
})
