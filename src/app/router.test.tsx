/**
 * Routing/shell smoke tests (`spec/tasks/06-app-shell-pwa.md` acceptance: "Все маршруты из
 * architecture.md §9 открываются и рендерят заглушку", "Нижняя навигация подсвечивает
 * активный раздел").
 *
 * `AppRouter` needs neither `ContentProvider` nor `DatabaseProvider` (both are `App.tsx`'s
 * concern, one level up), so these tests render it directly — no fetch/IndexedDB mocking
 * needed, just `history.pushState` before each render to pick the initial route (React
 * Router's `<BrowserRouter>` reads `window.location` at mount time).
 *
 * `/words` is the one exception since task 07: it's no longer a provider-agnostic stub, it's
 * the real `WordsListPage`, which reads the content index (`content/index-store.ts`) and the
 * `wordProgress` table directly. Its heading check therefore seeds a minimal index first
 * (`initIndexStore([])` — an empty index is enough for "the heading renders", the actual
 * filtering/list behavior is `WordsListPage.test.tsx`'s job) instead of living in the
 * provider-agnostic `it.each` table below.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AppRouter } from './router.tsx'
import { wordPath } from './word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<AppRouter />)
}

/** Same fetch-stub shape as `content/senses.test.ts`/`content/paradigms.test.ts`: routes any
 *  URL containing `senses/000.json` to an empty shard, 404s everything else — enough for
 *  `/words/:wordId`'s eager senses fetch (task 08) to resolve without hitting the network,
 *  without needing to model real sense data (that's `WordDetailPage.test.tsx`'s job). */
function stubEmptySensesFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url)
      if (href.includes('senses/000.json')) {
        return { ok: true, json: async () => ({}) } as Response
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }),
  )
}

afterEach(() => {
  cleanup()
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  vi.unstubAllGlobals()
})

describe('AppRouter', () => {
  it.each([
    ['/', 'Главная'],
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

  it('renders the /words screen (WordsListPage, task 07)', () => {
    initIndexStore([])
    renderAt('/words')
    expect(screen.getByRole('heading', { name: 'Слова' })).toBeInTheDocument()
  })

  it('decodes a URL-encoded :wordId (special characters, diacritics) on the word detail route', () => {
    stubEmptySensesFetch()
    const wordId = encodeWordId('kobieta', 'NOUN')
    initIndexStore([
      {
        lemma: 'kobieta',
        pos: 'NOUN',
        rank: 95,
        level: 'A1',
        primaryRu: 'женщина',
        sensesShard: 0,
        paradigmShard: -1,
      },
    ])
    renderAt(wordPath(wordId))
    expect(screen.getByRole('heading', { name: 'kobieta' })).toBeInTheDocument()
    expect(screen.getByText(/Существительное/)).toBeInTheDocument()
  })

  it('decodes a lemma with Polish diacritics on the word detail route', () => {
    stubEmptySensesFetch()
    const wordId = encodeWordId('żółty', 'ADJ')
    initIndexStore([
      {
        lemma: 'żółty',
        pos: 'ADJ',
        rank: 300,
        level: 'B1',
        primaryRu: 'жёлтый',
        sensesShard: 0,
        paradigmShard: -1,
      },
    ])
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
