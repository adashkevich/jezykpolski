/**
 * `/words` integration tests (`spec/tasks/07-words-list.md` acceptance list).
 *
 * Renders the real `WordsListPage` against a small synthetic content index
 * (`initIndexStore`, task 04) instead of the real 7998-word corpus — the exact large-scale
 * invariants ("«До уровня B1» даёт ровно 3903 слова", "«Топ 500» даёт ровно 500 слов") are
 * `content/query.test.ts`'s job (task 04) plus a manual check against the real built
 * `public/content/index.json` (see this task's final report); what this file verifies is
 * that `WordsListPage` wires filters/search/sort/status correctly into `queryWords` and
 * renders the result, which a handful of hand-picked words is enough to exercise.
 *
 * `@tanstack/react-virtual` sizes its viewport off `element.offsetHeight`/`offsetWidth`
 * (`virtual-core`'s `getRect`), which jsdom always reports as `0` (it does no layout) — the
 * scroll container would measure as 0×0 and the virtualizer would compute zero visible rows.
 * `stubScrollContainerSize()` below stubs those two accessors on `HTMLElement.prototype` so
 * a realistic number of rows actually mount, the same trick `@tanstack/react-virtual`'s own
 * test suite uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { WordsListPage } from './WordsListPage.tsx'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { get as settingsGet } from '@/db/repositories/settings.repository.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'
import type { WordIndexEntry } from '@/types/content.ts'

const FIXTURE_WORDS: readonly WordIndexEntry[] = [
  {
    lemma: 'być',
    pos: 'VERB',
    rank: 1,
    level: 'A1',
    primaryRu: 'быть',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'mieć',
    pos: 'VERB',
    rank: 5,
    level: 'A1',
    primaryRu: 'иметь',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'kot',
    pos: 'NOUN',
    rank: 2,
    level: 'A1',
    primaryRu: 'кот',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'człowiek',
    pos: 'NOUN',
    rank: 10,
    level: 'A1',
    primaryRu: 'человек',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'dobry',
    pos: 'ADJ',
    rank: 20,
    level: 'A2',
    primaryRu: 'хороший',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'żółty',
    pos: 'ADJ',
    rank: 300,
    level: 'B1',
    primaryRu: 'жёлтый',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'szybko',
    pos: 'ADV',
    rank: 150,
    level: 'B1',
    primaryRu: 'быстро',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'aczkolwiek',
    pos: 'ADV',
    rank: 4000,
    level: 'B2',
    primaryRu: 'хотя',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'implikacja',
    pos: 'NOUN',
    rank: 6000,
    level: 'C1',
    primaryRu: 'импликация',
    sensesShard: 0,
    paradigmShard: 0,
  },
  {
    lemma: 'zaiste',
    pos: 'ADV',
    rank: 7500,
    level: 'C2',
    primaryRu: 'воистину',
    sensesShard: 0,
    paradigmShard: 0,
  },
]

const DEFAULT_FILTER_STATE = {
  levels: [],
  upToMode: false,
  upToLevel: null,
  pos: null,
  status: null,
  topN: null,
  sort: 'frequency' as const,
  search: '',
  scrollOffset: 0,
}

function stubScrollContainerSize() {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)
}

/** Surfaces `location.state` as text so a test can assert on the payload `LearnFab` passes
 *  to `navigate('/session', { state: ... })` without needing the real `SessionPage`. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
}

function renderWordsListPage() {
  return render(
    <MemoryRouter initialEntries={['/words']}>
      <Routes>
        <Route path="/words" element={<WordsListPage />} />
        <Route path="/session" element={<SessionStateProbe />} />
        <Route path="/words/:wordId" element={<div>word detail stub</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await openDatabase()
  initIndexStore(FIXTURE_WORDS)
  useFiltersStore.setState({ ...DEFAULT_FILTER_STATE })
  stubScrollContainerSize()
})

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  vi.restoreAllMocks()
  await deleteDatabase()
})

describe('WordsListPage', () => {
  it('renders the full fixture list with a result count', () => {
    renderWordsListPage()
    expect(screen.getByText(`Найдено ${FIXTURE_WORDS.length}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /być/ })).toBeInTheDocument()
  })

  it('rows are real links with correct href and are keyboard-focusable', () => {
    renderWordsListPage()
    const link = screen.getByRole('link', { name: /być/ })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', expect.stringContaining('/words/'))
    link.focus()
    expect(link).toHaveFocus()
  })

  it('status is shown as an icon + text label, not color alone', () => {
    renderWordsListPage()
    // Every fixture word has no progress row yet, so every row is 'new'.
    const badges = screen.getAllByText('Новое')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('filters by POS tab and only then shows the "Формы" bar', () => {
    renderWordsListPage()
    // "Все": no progressbar (bar track renders, but empty — not filled/announced).
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)

    fireClickTab('Глаголы')
    expect(screen.getByText('Найдено 2')).toBeInTheDocument() // być, mieć
    expect(screen.queryAllByRole('progressbar').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /kot/ })).not.toBeInTheDocument()
  })

  it('POS "Наречия" filters correctly but does NOT show the Формы bar (FR-05)', () => {
    renderWordsListPage()
    fireClickTab('Наречия')
    expect(screen.getByText('Найдено 3')).toBeInTheDocument() // szybko, aczkolwiek, zaiste
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
  })

  it('level chip multi-select narrows the list to the selected levels', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.click(screen.getByRole('button', { name: 'C1' }))
    expect(screen.getByText('Найдено 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /implikacja/ })).toBeInTheDocument()
  })

  it('"До уровня B1" includes every word at or below B1', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.click(screen.getByRole('checkbox', { name: /до уровня/i }))
    await user.click(screen.getByRole('button', { name: 'B1' }))
    // A1 (4) + A2 (1) + B1 (2: żółty, szybko) = 7, excludes B2/C1/C2.
    expect(screen.getByText('Найдено 7')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /aczkolwiek/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /implikacja/ })).not.toBeInTheDocument()
  })

  it('search matches the Polish lemma', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.type(screen.getByRole('searchbox'), 'byc')
    await waitFor(() => expect(screen.getByText('Найдено 1')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /być/ })).toBeInTheDocument()
  })

  it('search matches the Russian translation', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.type(screen.getByRole('searchbox'), 'кот')
    await waitFor(() => expect(screen.getByText('Найдено 1')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /kot/ })).toBeInTheDocument()
  })

  it('search is diacritic-insensitive ("zolty" finds "żółty")', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.type(screen.getByRole('searchbox'), 'zolty')
    await waitFor(() => expect(screen.getByText('Найдено 1')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /żółty/ })).toBeInTheDocument()
  })

  it('an empty result shows EmptyState with a reset action, which restores the full list', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.type(screen.getByRole('searchbox'), 'this matches nothing at all')
    await waitFor(() => expect(screen.getByText('Ничего не найдено')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    await waitFor(() =>
      expect(screen.getByText(`Найдено ${FIXTURE_WORDS.length}`)).toBeInTheDocument(),
    )
  })

  it('sort "по алфавиту" reorders the list using the Polish collator order', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.click(screen.getByRole('button', { name: /фильтры/i }))
    await user.selectOptions(screen.getByLabelText('Сортировка'), 'По алфавиту')
    // Close the sheet — while a Radix `Dialog` is open, everything else is
    // `aria-hidden`'d for screen readers, which Testing Library respects, so the list rows
    // behind it are unreachable by role until it closes.
    await user.keyboard('{Escape}')
    const links = await screen.findAllByRole('link')
    // 'aczkolwiek' sorts first alphabetically among the fixture lemmas.
    expect(within(links[0]!).getByText('aczkolwiek')).toBeInTheDocument()
  })

  it('status filter narrows to words with that status (all fixture words are "new")', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    await user.click(screen.getByRole('button', { name: /фильтры/i }))
    await user.selectOptions(screen.getByLabelText('Статус'), 'Знаю')
    await waitFor(() => expect(screen.getByText('Ничего не найдено')).toBeInTheDocument())
  })

  it('"Учить" navigates to /session carrying the current filter as router state', async () => {
    const user = userEvent.setup()
    renderWordsListPage()
    fireClickTab('Глаголы')
    await user.click(screen.getByRole('button', { name: /учить/i }))

    const stateText = screen.getByTestId('session-state').textContent ?? ''
    const state = JSON.parse(stateText) as { filter: { pos?: string[] } }
    expect(state.filter.pos).toEqual(['VERB'])
  })

  it('filters survive unmount/remount (e.g. navigating to a word card and back)', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWordsListPage()

    await user.click(screen.getByRole('button', { name: 'C1' }))
    expect(screen.getByText('Найдено 1')).toBeInTheDocument()

    unmount()
    renderWordsListPage()
    expect(screen.getByText('Найдено 1')).toBeInTheDocument()
  })

  it('the underlying settings-repository write that survives an actual reload eventually lands', async () => {
    // The full "wipe in-memory state, rehydrate from what was persisted" round trip against
    // a real reload is `filters.store.test.ts`'s job (it isolates the write and read halves
    // to avoid `setState`'s own re-persist-on-every-call clobbering the very row being read
    // back — see that file's comments). This just confirms `WordsListPage` actually drives a
    // write through to storage, i.e. that FR-30 wiring is live end-to-end from this screen.
    const user = userEvent.setup()
    renderWordsListPage()
    await user.click(screen.getByRole('button', { name: 'C1' }))

    await waitFor(async () => {
      const stored = await settingsGet<{ state?: { levels?: string[] } } | null>(
        'wordsListFilters',
        null,
      )
      expect(stored?.state?.levels).toEqual(['C1'])
    })
  })
})

/** Clicks a POS tab by its visible label (`PosTabs.tsx`). `fireEvent` (not a raw DOM
 *  `.click()`) so the resulting state update is flushed inside `act()` before the next
 *  assertion runs. */
function fireClickTab(label: string) {
  fireEvent.click(screen.getByRole('tab', { name: label }))
}
