/**
 * `/words/:wordId` integration tests (`spec/tasks/08-word-detail.md` acceptance list).
 *
 * Renders the real `WordDetailPage` against a small synthetic content index + a stubbed
 * `fetch` serving hand-picked real paradigm/senses data (verified against the actual built
 * `public/content/**` shards — see the raw form arrays' own comments below for exactly which
 * shard each was copied from), the same technique `content/paradigms.test.ts` and
 * `WordsListPage.test.tsx` already use.
 *
 * Five words cover the acceptance list's content shapes:
 *  - `kobieta|NOUN` — full 7-case x 2-number declension.
 *  - `robić|VERB` — present/future(analytic)/imperative/past(gendered).
 *  - `dobry|ADJ` — case x gender grid with an sg/pl toggle, plus degrees of comparison.
 *  - `chłodno|ADV` — degrees of comparison only, always expanded like the other three POS
 *    (no "Формы" progress bar or dimension breakdown either, same as NOUN/VERB/ADJ).
 *  - `powinien|VERB` — one of the 14 real paradigm-less words (`paradigmShard: -1`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { WordDetailPage } from './WordDetailPage.tsx'
import { wordPath } from '@/app/word-path.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkillsForWord, upsertSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import type { EncodedForm } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

// ---------------------------------------------------------------------------
// Fixture content — real forms copied from the built `public/content/**` shards (task 08's
// decision log records the exact `node -e` inspection each block came from).
// ---------------------------------------------------------------------------

// `public/content/paradigms/042.json`'s `kobieta|NOUN` entry.
const KOBIETA_RAW_FORMS: EncodedForm[] = [
  ['kobiety', 2, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobietom', 2, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiet', 2, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietami', 2, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobietach', 2, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 7, 1, 0, 0, 0, 0, 0, 0],
  ['kobietę', 1, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 1, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietą', 1, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobieta', 1, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobieto', 1, 7, 1, 0, 0, 0, 0, 0, 0],
]

// `public/content/paradigms/057.json`'s `robić|VERB` entry.
const ROBIC_RAW_FORMS: EncodedForm[] = [
  ['będziemy robić', 2, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziecie robić', 2, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będą robić', 2, 0, 0, 0, 3, 3, 1, 1, 1],
  ['będę robić', 1, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziesz robić', 1, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będzie robić', 1, 0, 0, 0, 3, 3, 1, 1, 1],
  ['robimy', 2, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robicie', 2, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robią', 2, 0, 0, 0, 1, 3, 1, 1, 0],
  ['robię', 1, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robisz', 1, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robi', 1, 0, 0, 0, 1, 3, 1, 1, 0],
  ['róbmy', 2, 0, 0, 0, 0, 1, 2, 1, 0],
  ['róbcie', 2, 0, 0, 0, 0, 2, 2, 1, 0],
  ['rób', 1, 0, 0, 0, 0, 2, 2, 1, 0],
  ['robić', 0, 0, 0, 0, 0, 0, 3, 1, 0],
  ['robiliśmy', 2, 0, 2, 0, 2, 1, 1, 1, 0],
  ['robiłyśmy', 2, 0, 6, 0, 2, 1, 1, 1, 0],
  ['robiliście', 2, 0, 2, 0, 2, 2, 1, 1, 0],
  ['robiłyście', 2, 0, 6, 0, 2, 2, 1, 1, 0],
  ['robili', 2, 0, 2, 0, 2, 3, 1, 1, 0],
  ['robiły', 2, 0, 6, 0, 2, 3, 1, 1, 0],
  ['robiłom', 1, 0, 5, 0, 2, 1, 1, 1, 0],
  ['robiłem', 1, 0, 10, 0, 2, 1, 1, 1, 0],
  ['robiłam', 1, 0, 1, 0, 2, 1, 1, 1, 0],
  ['robiłeś', 1, 0, 10, 0, 2, 2, 1, 1, 0],
  ['robiłaś', 1, 0, 1, 0, 2, 2, 1, 1, 0],
  ['robiłoś', 1, 0, 5, 0, 2, 2, 1, 1, 0],
  ['robił', 1, 0, 10, 0, 2, 3, 1, 1, 0],
  ['robiła', 1, 0, 1, 0, 2, 3, 1, 1, 0],
  ['robiło', 1, 0, 5, 0, 2, 3, 1, 1, 0],
]

// `public/content/paradigms/006.json`'s `dobry|ADJ` entry, in full (84 forms).
const DOBRY_RAW_FORMS: EncodedForm[] = [
  ['dobre', 2, 4, 6, 1, 0, 0, 0, 0, 0],
  ['lepszych', 2, 4, 2, 2, 0, 0, 0, 0, 0],
  ['lepsze', 2, 4, 6, 2, 0, 0, 0, 0, 0],
  ['dobrych', 2, 4, 2, 1, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 4, 6, 3, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 4, 2, 3, 0, 0, 0, 0, 0],
  ['dobrym', 2, 3, 7, 1, 0, 0, 0, 0, 0],
  ['lepszym', 2, 3, 7, 2, 0, 0, 0, 0, 0],
  ['najlepszym', 2, 3, 7, 3, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 2, 7, 3, 0, 0, 0, 0, 0],
  ['lepszych', 2, 2, 7, 2, 0, 0, 0, 0, 0],
  ['dobrych', 2, 2, 7, 1, 0, 0, 0, 0, 0],
  ['lepszymi', 2, 5, 7, 2, 0, 0, 0, 0, 0],
  ['dobrymi', 2, 5, 7, 1, 0, 0, 0, 0, 0],
  ['najlepszymi', 2, 5, 7, 3, 0, 0, 0, 0, 0],
  ['lepszych', 2, 6, 7, 2, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 6, 7, 3, 0, 0, 0, 0, 0],
  ['dobrych', 2, 6, 7, 1, 0, 0, 0, 0, 0],
  ['dobre', 2, 1, 6, 1, 0, 0, 0, 0, 0],
  ['najlepsi', 2, 1, 2, 3, 0, 0, 0, 0, 0],
  ['lepsi', 2, 1, 2, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 1, 6, 3, 0, 0, 0, 0, 0],
  ['lepsze', 2, 1, 6, 2, 0, 0, 0, 0, 0],
  ['dobrzy', 2, 1, 2, 1, 0, 0, 0, 0, 0],
  ['lepsze', 2, 7, 6, 2, 0, 0, 0, 0, 0],
  ['dobre', 2, 7, 6, 1, 0, 0, 0, 0, 0],
  ['dobrzy', 2, 7, 2, 1, 0, 0, 0, 0, 0],
  ['najlepsi', 2, 7, 2, 3, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 7, 6, 3, 0, 0, 0, 0, 0],
  ['lepsi', 2, 7, 2, 2, 0, 0, 0, 0, 0],
  ['dobrego', 1, 4, 8, 1, 0, 0, 0, 0, 0],
  ['dobrą', 1, 4, 1, 1, 0, 0, 0, 0, 0],
  ['lepsze', 1, 4, 5, 2, 0, 0, 0, 0, 0],
  ['dobry', 1, 4, 3, 1, 0, 0, 0, 0, 0],
  ['lepszą', 1, 4, 1, 2, 0, 0, 0, 0, 0],
  ['lepszy', 1, 4, 3, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 4, 5, 3, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 4, 3, 3, 0, 0, 0, 0, 0],
  ['najlepszego', 1, 4, 8, 3, 0, 0, 0, 0, 0],
  ['najlepszą', 1, 4, 1, 3, 0, 0, 0, 0, 0],
  ['lepszego', 1, 4, 8, 2, 0, 0, 0, 0, 0],
  ['dobre', 1, 4, 5, 1, 0, 0, 0, 0, 0],
  ['lepszemu', 1, 3, 9, 2, 0, 0, 0, 0, 0],
  ['dobrej', 1, 3, 1, 1, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 3, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszemu', 1, 3, 9, 3, 0, 0, 0, 0, 0],
  ['lepszej', 1, 3, 1, 2, 0, 0, 0, 0, 0],
  ['dobremu', 1, 3, 9, 1, 0, 0, 0, 0, 0],
  ['dobrej', 1, 2, 1, 1, 0, 0, 0, 0, 0],
  ['lepszej', 1, 2, 1, 2, 0, 0, 0, 0, 0],
  ['lepszego', 1, 2, 9, 2, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 2, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszego', 1, 2, 9, 3, 0, 0, 0, 0, 0],
  ['dobrego', 1, 2, 9, 1, 0, 0, 0, 0, 0],
  ['dobrym', 1, 5, 9, 1, 0, 0, 0, 0, 0],
  ['lepszą', 1, 5, 1, 2, 0, 0, 0, 0, 0],
  ['lepszym', 1, 5, 9, 2, 0, 0, 0, 0, 0],
  ['dobrą', 1, 5, 1, 1, 0, 0, 0, 0, 0],
  ['najlepszą', 1, 5, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszym', 1, 5, 9, 3, 0, 0, 0, 0, 0],
  ['dobrej', 1, 6, 1, 1, 0, 0, 0, 0, 0],
  ['dobrym', 1, 6, 9, 1, 0, 0, 0, 0, 0],
  ['lepszej', 1, 6, 1, 2, 0, 0, 0, 0, 0],
  ['lepszym', 1, 6, 9, 2, 0, 0, 0, 0, 0],
  ['najlepszym', 1, 6, 9, 3, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 6, 1, 3, 0, 0, 0, 0, 0],
  ['dobre', 1, 1, 5, 1, 0, 0, 0, 0, 0],
  ['dobra', 1, 1, 1, 1, 0, 0, 0, 0, 0],
  ['lepsza', 1, 1, 1, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 1, 5, 3, 0, 0, 0, 0, 0],
  ['lepszy', 1, 1, 10, 2, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 1, 10, 3, 0, 0, 0, 0, 0],
  ['lepsze', 1, 1, 5, 2, 0, 0, 0, 0, 0],
  ['najlepsza', 1, 1, 1, 3, 0, 0, 0, 0, 0],
  ['dobry', 1, 1, 10, 1, 0, 0, 0, 0, 0],
  ['dobry', 1, 7, 10, 1, 0, 0, 0, 0, 0],
  ['lepszy', 1, 7, 10, 2, 0, 0, 0, 0, 0],
  ['dobra', 1, 7, 1, 1, 0, 0, 0, 0, 0],
  ['lepsza', 1, 7, 1, 2, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 7, 10, 3, 0, 0, 0, 0, 0],
  ['lepsze', 1, 7, 5, 2, 0, 0, 0, 0, 0],
  ['najlepsza', 1, 7, 1, 3, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 7, 5, 3, 0, 0, 0, 0, 0],
  ['dobre', 1, 7, 5, 1, 0, 0, 0, 0, 0],
]

// `public/content/paradigms/001.json`'s `chłodno|ADV` entry — degrees of comparison only.
const CHLODNO_RAW_FORMS: EncodedForm[] = [
  ['chłodno', 0, 0, 0, 1, 0, 0, 0, 0, 0],
  ['chłodniej', 0, 0, 0, 2, 0, 0, 0, 0, 0],
  ['najchłodniej', 0, 0, 0, 3, 0, 0, 0, 0, 0],
]

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const ROBIC_ID = encodeWordId('robić', 'VERB')
const DOBRY_ID = encodeWordId('dobry', 'ADJ')
const CHLODNO_ID = encodeWordId('chłodno', 'ADV')
const POWINIEN_ID = encodeWordId('powinien', 'VERB')

const FIXTURE_ENTRIES: readonly WordIndexEntry[] = [
  {
    lemma: 'kobieta',
    pos: 'NOUN',
    rank: 95,
    level: 'A1',
    primaryRu: 'женщина',
    sensesShard: 0,
    paradigmShard: 1,
  },
  {
    lemma: 'robić',
    pos: 'VERB',
    rank: 69,
    level: 'A1',
    primaryRu: 'делать',
    sensesShard: 0,
    paradigmShard: 2,
  },
  {
    lemma: 'dobry',
    pos: 'ADJ',
    rank: 37,
    level: 'A2',
    primaryRu: 'хороший',
    sensesShard: 0,
    paradigmShard: 3,
  },
  {
    lemma: 'chłodno',
    pos: 'ADV',
    rank: 120,
    level: 'B1',
    primaryRu: 'холодно',
    sensesShard: 0,
    paradigmShard: 4,
  },
  {
    lemma: 'powinien',
    pos: 'VERB',
    rank: 75,
    level: 'A2',
    primaryRu: 'должен',
    sensesShard: 0,
    paradigmShard: -1,
  },
]

const SENSES_SHARD = {
  'kobieta|NOUN': [
    { ru: ['женщина'], en: 'woman', primary: true },
    { ru: ['жена'], primary: false },
  ],
  'robić|VERB': [{ ru: ['делать'], primary: true }],
  'dobry|ADJ': [{ ru: ['хороший'], primary: true }],
  'chłodno|ADV': [{ ru: ['холодно'], primary: true }],
  'powinien|VERB': [{ ru: ['должен'], primary: true }],
}

function makeFetchMock() {
  const routes: Record<string, unknown> = {
    'senses/000.json': SENSES_SHARD,
    'paradigms/001.json': { 'kobieta|NOUN': { forms: KOBIETA_RAW_FORMS, dominantGender: 1 } },
    'paradigms/002.json': { 'robić|VERB': { forms: ROBIC_RAW_FORMS } },
    'paradigms/003.json': { 'dobry|ADJ': { forms: DOBRY_RAW_FORMS } },
    'paradigms/004.json': { 'chłodno|ADV': { forms: CHLODNO_RAW_FORMS } },
  }
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

let fetchMock: ReturnType<typeof makeFetchMock>

function fetchedUrlsContaining(substring: string): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(substring)).length
}

function renderWordDetail(wordId: string) {
  return render(
    <MemoryRouter initialEntries={[wordPath(wordId)]}>
      <Routes>
        <Route path="/words/:wordId" element={<WordDetailPage />} />
        <Route path="/session" element={<SessionStateProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Surfaces `location.state` as text, mirroring `WordsListPage.test.tsx`'s own probe, so
 *  "Учить"'s `navigate('/session', { state })` payload can be asserted on. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
}

// Every POS's forms block is always expanded now (paradigm loads on mount, no disclosure
// button) — this just waits out the loading state; kept as a no-op-click helper in case a
// future POS reintroduces a collapsible block.
async function expandForms() {
  const button = screen.queryByRole('button', { name: /формы слова/i })
  if (button) {
    const user = userEvent.setup()
    await user.click(button)
  }
  await waitFor(() => expect(screen.queryByText('Загрузка форм…')).not.toBeInTheDocument())
}

beforeEach(async () => {
  await openDatabase()
  initIndexStore(FIXTURE_ENTRIES)
  fetchMock = makeFetchMock()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

describe('header, senses (FR-40/FR-41)', () => {
  it('shows lemma, POS, level, rank and the primary translation', async () => {
    renderWordDetail(KOBIETA_ID)
    expect(screen.getByRole('heading', { name: 'kobieta' })).toBeInTheDocument()
    expect(screen.getByText(/Существительное/)).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText(/частота #95/)).toBeInTheDocument()
    expect(screen.getByText('женщина')).toBeInTheDocument()
  })

  it('lists every sense, primary marked, with the English gloss as secondary text', async () => {
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByText('Значения')).toBeInTheDocument())
    // "женщина" appears twice — once as the header's primary translation, once as sense #1.
    expect(screen.getAllByText('женщина').length).toBe(2)
    expect(screen.getByText('жена')).toBeInTheDocument()
    expect(screen.getByText('woman')).toBeInTheDocument()
  })
})

describe('ADV — "Формы слова" is always expanded, no disclosure control', () => {
  it('renders the degree-of-comparison rows immediately and fetches the paradigm without any click', async () => {
    renderWordDetail(CHLODNO_ID)
    await waitFor(() => expect(screen.getByText('chłodniej')).toBeInTheDocument())
    expect(fetchedUrlsContaining('paradigms/004.json')).toBe(1)
    expect(screen.queryByRole('button', { name: /формы/i })).not.toBeInTheDocument()
  })
})

describe('NOUN — "Формы и склонение" is always expanded, no disclosure control', () => {
  it('renders the declension list immediately and fetches the paradigm without any click', async () => {
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0))
    expect(fetchedUrlsContaining('paradigms/001.json')).toBe(1)
    expect(screen.queryByRole('button', { name: /формы/i })).not.toBeInTheDocument()
  })
})

describe('VERB — "Формы и спряжение" is always expanded, no disclosure control', () => {
  it('renders the conjugation tabs immediately and fetches the paradigm without any click', async () => {
    renderWordDetail(ROBIC_ID)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Настоящее' })).toBeInTheDocument())
    expect(fetchedUrlsContaining('paradigms/002.json')).toBe(1)
    expect(screen.queryByRole('button', { name: /формы/i })).not.toBeInTheDocument()
  })
})

describe('ADJ — "Формы и склонение" is always expanded, no disclosure control (task 22)', () => {
  it('renders the case x gender grid immediately and fetches the paradigm without any click', async () => {
    renderWordDetail(DOBRY_ID)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(fetchedUrlsContaining('paradigms/003.json')).toBe(1)
    expect(screen.queryByRole('button', { name: /формы/i })).not.toBeInTheDocument()
  })
})

describe('acceptance 2 — kobieta declension: 7 cases x 2 numbers, correct forms', () => {
  it('renders every case row with its real singular/plural forms, switching between number tabs', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await expandForms()

    // Scoped to the declension block's own container — the page also has an unrelated
    // `<ol>` of senses, which `getAllByRole('listitem')` would otherwise pick up too.
    const numberGroup = screen.getByRole('group', { name: 'Число' })
    const declensionBlock = within(numberGroup.parentElement!)
    const rows = declensionBlock.getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    const listText = () => rows.map((row) => row.textContent).join(' ')

    // Singular is the default tab.
    expect(listText()).toContain('kobieta')
    expect(listText()).toContain('kobiecie')
    expect(listText()).toContain('kobietę')
    expect(listText()).toContain('kobietą')
    expect(listText()).toContain('kobieto')

    await user.click(screen.getByRole('button', { name: 'Мн. число' }))
    expect(listText()).toContain('kobiety')
    expect(listText()).toContain('kobiet')
    expect(listText()).toContain('kobietom')
    expect(listText()).toContain('kobietami')
    expect(listText()).toContain('kobietach')
  })
})

describe('task 17 §4 — declension table cells are clickable, navigate with the skill scope', () => {
  it('clicking the Narzędnik/singular cell sends exactly that skillId as targetSkillIds (not the mistake-scope skillIds)', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await expandForms()

    await user.click(screen.getByRole('button', { name: /Narzędnik.*liczba pojedyncza/i }))

    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
      skillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([`${KOBIETA_ID}::noun:sg:instrumental`])
    expect(state.skillIds).toBeUndefined()
  })
})

describe('acceptance 3 & 5 — robić conjugation: present/future/past tabs, imperative always shown below, analytic marked', () => {
  it('shows three tense tabs, an always-visible imperative block, and marks the analytic future', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    const user = userEvent.setup()

    expect(screen.getByRole('tab', { name: 'Настоящее' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Будущее' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Прошедшее' })).toBeInTheDocument()
    // Imperative is not a tab — it's a second, always-visible list underneath.
    expect(screen.queryByRole('tab', { name: /Повелительное/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Повелительное наклонение' })).toBeInTheDocument()

    // Present is the default active tab.
    expect(screen.getByRole('tabpanel', { name: 'Настоящее' }).textContent).toContain('robię') // present, 1sg

    await user.click(screen.getByRole('tab', { name: 'Будущее' }))
    expect(screen.getByRole('tabpanel', { name: 'Будущее' }).textContent).toContain('będę robić') // future, 1sg — analytic
    expect(screen.getAllByText('аналит.').length).toBeGreaterThan(0)
  })
})

describe('acceptance 4 — past tense shows the gendered variants', () => {
  it('robiłem (masc.) and robiłam (fem.) both appear, as separate gender rows in the same "ja" block', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Прошедшее' }))
    const pastPanel = screen.getByRole('tabpanel', { name: 'Прошедшее' })
    expect(pastPanel.textContent).toContain('robiłem')
    expect(pastPanel.textContent).toContain('robiłam')

    // Badge + form rows (task's own ask), not a wide case x gender grid — masculine and
    // feminine are two separate buttons, both under the "ja" block.
    const masc = within(pastPanel).getByRole('button', { name: /Czas przeszły, ja, męski:/i })
    expect(masc.textContent).toContain('robiłem')
    const fem = within(pastPanel).getByRole('button', { name: /Czas przeszły, ja, żeński:/i })
    expect(fem.textContent).toContain('robiłam')
  })
})

describe('task 20 — pronouns instead of digits', () => {
  it('labels rows with pronouns (ja, ty, on·ona·ono, my, wy, oni·one)', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    const tabpanel = screen.getByRole('tabpanel', { name: 'Настоящее' })
    expect(within(tabpanel).getByRole('rowheader', { name: 'ja' })).toBeInTheDocument()
    expect(within(tabpanel).getByRole('rowheader', { name: 'ty' })).toBeInTheDocument()
    expect(within(tabpanel).getByRole('rowheader', { name: 'on · ona · ono' })).toBeInTheDocument()
    expect(within(tabpanel).getByRole('rowheader', { name: 'my' })).toBeInTheDocument()
    expect(within(tabpanel).getByRole('rowheader', { name: 'wy' })).toBeInTheDocument()
    expect(within(tabpanel).getByRole('rowheader', { name: 'oni · one' })).toBeInTheDocument()
    expect(screen.queryByText('1 л.')).not.toBeInTheDocument()
  })
})

describe('task 20 — conjugation table cells are clickable too (same mechanism as task 17)', () => {
  it('clicking the present-tense ja cell sends exactly that skillId as targetSkillIds', async () => {
    const user = userEvent.setup()
    renderWordDetail(ROBIC_ID)
    await expandForms()

    await user.click(screen.getByRole('button', { name: /Настоящее, ja/i }))

    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
      skillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([`${ROBIC_ID}::verb:present:1:sg`])
    expect(state.skillIds).toBeUndefined()
  })
})

describe('acceptance 5 — dobry: sg/pl toggle and degrees of comparison', () => {
  it('defaults to singular, switches to plural on toggle, and shows the degree block', async () => {
    renderWordDetail(DOBRY_ID)
    await expandForms()

    // Singular (default): masculine nominative citation form "dobry".
    expect(screen.getByRole('table').textContent).toContain('dobry')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Мн. число' }))
    // Plural masculine-personal nominative: "dobrzy" (not present in the singular grid).
    await waitFor(() => expect(screen.getByRole('table').textContent).toContain('dobrzy'))

    expect(screen.getByText('lepszy')).toBeInTheDocument()
    expect(screen.getByText('najlepszy')).toBeInTheDocument()
  })
})

describe('acceptance 6 — a paradigm-less word opens without errors and has no forms block', () => {
  it('powinien (paradigmShard: -1) renders the header/senses/progress but no forms section', async () => {
    renderWordDetail(POWINIEN_ID)
    await waitFor(() => expect(screen.getByText('Значения')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'powinien' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /формы (слова|и склонение)/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Интервальное повторение')).toBeInTheDocument()
    // No "Формы" bar either — nothing to track for a word with no morphology at all.
    expect(screen.queryByText('Формы')).not.toBeInTheDocument()
  })
})

describe('acceptance 7 — the "Запоминание карточки" bar matches the persisted wordProgress (== aggregateWord)', () => {
  it('shows vocabMaturity as the "Запоминание карточки" percentage', async () => {
    // vocab:pl-ru stability 30 -> maturity 0.5 (TARGET_STABILITY_DAYS = 60); the other two
    // vocab skills (vocab:ru-pl-choice/vocab:ru-pl-input, task 37) stay unmaterialized
    // (maturity 0), so vocabMaturity averages to 0.5/3 ≈ 0.167.
    const skill: SkillRecord = {
      skillId: `${CHLODNO_ID}::vocab:pl-ru`,
      wordId: CHLODNO_ID,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 30,
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    }
    await upsertSkill(skill)
    await recomputeWordProgress(CHLODNO_ID)

    renderWordDetail(CHLODNO_ID)
    await waitFor(() => expect(screen.getByText('Интервальное повторение')).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByLabelText('Запоминание карточки: 17%')).toBeInTheDocument(),
    )
  })
})

describe('NOUN — no "Формы" bar, no "Детализация по измерениям" breakdown', () => {
  it('shows only "Запоминание карточки", with no morphology bar or dimension-breakdown control', async () => {
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByText('Интервальное повторение')).toBeInTheDocument())
    expect(screen.getByLabelText(/Запоминание карточки/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Формы/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Детализация по измерениям' }),
    ).not.toBeInTheDocument()
  })
})

describe('VERB — no "Формы" bar, no "Детализация по измерениям" breakdown', () => {
  it('shows only "Запоминание карточки", with no morphology bar or dimension-breakdown control', async () => {
    renderWordDetail(ROBIC_ID)
    await waitFor(() => expect(screen.getByText('Интервальное повторение')).toBeInTheDocument())
    expect(screen.getByLabelText(/Запоминание карточки/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Формы/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Детализация по измерениям' }),
    ).not.toBeInTheDocument()
  })
})

describe('ADJ — no "Формы" bar, no "Детализация по измерениям" breakdown (task 22)', () => {
  it('shows only "Запоминание карточки", with no morphology bar or dimension-breakdown control', async () => {
    renderWordDetail(DOBRY_ID)
    await waitFor(() => expect(screen.getByText('Интервальное повторение')).toBeInTheDocument())
    expect(screen.getByLabelText(/Запоминание карточки/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Формы/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Детализация по измерениям' }),
    ).not.toBeInTheDocument()
  })
})

describe('ADV — no "Формы" bar, no "Детализация по измерениям" breakdown', () => {
  it('shows only "Запоминание карточки", with no morphology bar or dimension-breakdown control', async () => {
    renderWordDetail(CHLODNO_ID)
    await waitFor(() => expect(screen.getByText('Интервальное повторение')).toBeInTheDocument())
    expect(screen.getByLabelText(/Запоминание карточки/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Формы/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Детализация по измерениям' }),
    ).not.toBeInTheDocument()
  })
})

describe('"Знаю" / "Не учить" (spec/design/word-noun.png, task 16 FR-29)', () => {
  it('"Знаю" moves all three vocab dimensions to state "review" and shows an undo toast', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Знаю' }))

    await waitFor(async () => {
      const skills = await getSkillsForWord(KOBIETA_ID)
      expect(skills).toHaveLength(3)
      expect(skills.every((s) => s.state === 'review')).toBe(true)
    })
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('kobieta')
    expect(screen.getByRole('button', { name: /отменить/i })).toBeInTheDocument()
  })

  it('the toast\'s "Отменить" fully reverts a "Знаю" write in Dexie', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Знаю' }))
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(3))

    await user.click(await screen.findByRole('button', { name: /отменить/i }))

    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(0))
  })

  it('"Не учить" deletes the word\'s vocab skills, leaving morphology skills untouched', async () => {
    const morphSkill: SkillRecord = {
      skillId: `${KOBIETA_ID}::noun:sg:instrumental`,
      wordId: KOBIETA_ID,
      kind: 'noun',
      dimension: 'noun:sg:instrumental',
      state: 'review',
      stability: 30,
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    }
    await upsertSkill(morphSkill)
    await upsertSkill({
      skillId: `${KOBIETA_ID}::vocab:pl-ru`,
      wordId: KOBIETA_ID,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 60,
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Не учить' }))

    await waitFor(async () => {
      const skills = await getSkillsForWord(KOBIETA_ID)
      expect(skills).toHaveLength(1)
      expect(skills[0]!.kind).toBe('noun')
    })
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('kobieta')
  })

  it('the toast\'s "Отменить" fully reverts a "Не учить" write in Dexie', async () => {
    await upsertSkill({
      skillId: `${KOBIETA_ID}::vocab:pl-ru`,
      wordId: KOBIETA_ID,
      kind: 'vocab',
      dimension: 'vocab:pl-ru',
      state: 'review',
      stability: 60,
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Не учить' }))
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(0))

    await user.click(await screen.findByRole('button', { name: /отменить/i }))
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(1))
  })
})
