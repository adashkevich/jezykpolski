/**
 * Routing/shell smoke tests (`spec/tasks/06-app-shell-pwa.md` acceptance: "Все маршруты из
 * architecture.md §9 открываются и рендерят заглушку", "Нижняя навигация подсвечивает
 * активный раздел").
 *
 * `AppRouter` needs neither `ContentProvider` nor `DatabaseProvider` (both are `App.tsx`'s
 * concern, one level up), so these tests render it directly — no fetch/IndexedDB mocking
 * needed, just `history.pushState` before each render to pick the initial route (React
 * Router's `<BrowserRouter>` reads `window.location` at mount time).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AppRouter } from './router.tsx'
import { wordPath } from './word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<AppRouter />)
}

afterEach(() => {
  cleanup()
})

describe('AppRouter', () => {
  it.each([
    ['/', 'Главная'],
    ['/words', 'Слова'],
    ['/nouns', 'Существительные'],
    ['/verbs', 'Глаголы'],
    ['/adjectives', 'Прилагательные'],
    ['/session', 'Сессия'],
    ['/session/result', 'Результаты сессии'],
    ['/practice', 'Практика'],
    ['/stats', 'Прогресс'],
    ['/settings', 'Настройки'],
  ])('renders the %s stub', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('decodes a URL-encoded :wordId (special characters, diacritics) on the word detail route', () => {
    const wordId = encodeWordId('kobieta', 'NOUN')
    renderAt(wordPath(wordId))
    expect(screen.getByRole('heading', { name: 'kobieta' })).toBeInTheDocument()
    expect(screen.getByText(/NOUN/)).toBeInTheDocument()
  })

  it('decodes a lemma with Polish diacritics on the word detail route', () => {
    const wordId = encodeWordId('żółty', 'ADJ')
    renderAt(wordPath(wordId))
    expect(screen.getByRole('heading', { name: 'żółty' })).toBeInTheDocument()
  })

  it('renders NotFoundPage for an unknown path instead of a blank screen', () => {
    // NotFoundPage's message comes from the shared EmptyState component (deliberately a <p>,
    // not an <h1> — EmptyState is also used for in-page "no results" states where it must
    // not introduce a second page heading), so query by text rather than heading role.
    renderAt('/this-route-does-not-exist')
    expect(screen.getByText('Страница не найдена')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
  })

  it('highlights "Слова" in the bottom nav for the sibling /nouns, /verbs, /adjectives routes', () => {
    renderAt('/verbs')
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(nav).getByRole('link', { name: /слова/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /главная/i })).not.toHaveAttribute('aria-current')
  })

  it('highlights "Главная" on the index route', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(nav).getByRole('link', { name: /главная/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('every bottom-nav link and the header settings link are real, keyboard-focusable anchors', () => {
    renderAt('/')
    for (const name of [/главная/i, /слова/i, /практика/i, /прогресс/i]) {
      expect(screen.getByRole('link', { name }).tagName).toBe('A')
    }
    expect(screen.getByRole('link', { name: 'Настройки' }).tagName).toBe('A')
  })
})
