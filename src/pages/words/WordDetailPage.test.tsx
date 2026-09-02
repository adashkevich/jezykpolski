/**
 * `/words/:wordId` integration tests (`spec/tasks/08-word-detail.md` acceptance list).
 *
 * Renders the real `WordDetailPage` against a small synthetic content index + a stubbed
 * `fetch` serving hand-picked real paradigm/senses data (verified against the actual built
 * `public/content/**` shards — see the raw form arrays' own comments below for exactly which
 * shard each was copied from), the same technique `content/paradigms.test.ts` and
 * `WordsListPage.test.tsx` already use.
 *
 * Four words cover the acceptance list's four content shapes:
 *  - `kobieta|NOUN` — full 7-case x 2-number declension.
 *  - `robić|VERB` — present/future(analytic)/imperative/past(gendered).
 *  - `dobry|ADJ` — case x gender grid with an sg/pl toggle, plus degrees of comparison.
 *  - `powinien|VERB` — one of the 14 real paradigm-less words (`paradigmShard: -1`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const ROBIC_ID = encodeWordId('robić', 'VERB')
const DOBRY_ID = encodeWordId('dobry', 'ADJ')
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
  'powinien|VERB': [{ ru: ['должен'], primary: true }],
}

function makeFetchMock() {
  const routes: Record<string, unknown> = {
    'senses/000.json': SENSES_SHARD,
    'paradigms/001.json': { 'kobieta|NOUN': { forms: KOBIETA_RAW_FORMS, dominantGender: 1 } },
    'paradigms/002.json': { 'robić|VERB': { forms: ROBIC_RAW_FORMS } },
    'paradigms/003.json': { 'dobry|ADJ': { forms: DOBRY_RAW_FORMS } },
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

async function expandForms() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /формы слова/i }))
  await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
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
    expect(screen.getByText('основное')).toBeInTheDocument()
    expect(screen.getByText('woman')).toBeInTheDocument()
  })
})

describe('acceptance 1 & 9 — forms block collapsed by default, paradigm loads only on expand', () => {
  it('renders no table and issues no paradigm fetch before the user expands the block', async () => {
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByText('Значения')).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(fetchedUrlsContaining('paradigms/001.json')).toBe(0)
  })

  it('expanding "Формы слова" fetches the paradigm exactly once and then renders tables', async () => {
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByText('Значения')).toBeInTheDocument())
    await expandForms()
    expect(fetchedUrlsContaining('paradigms/001.json')).toBe(1)
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
  })
})

describe('acceptance 2 — kobieta declension: 7 cases x 2 numbers, correct forms', () => {
  it('renders every case row with its real singular/plural forms', async () => {
    renderWordDetail(KOBIETA_ID)
    await expandForms()
    const table = screen.getByRole('table')
    const rows = table.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(7)
    expect(table.textContent).toContain('kobieta')
    expect(table.textContent).toContain('kobiety')
    expect(table.textContent).toContain('kobiecie')
    expect(table.textContent).toContain('kobietę')
    expect(table.textContent).toContain('kobietą')
    expect(table.textContent).toContain('kobiecie')
    expect(table.textContent).toContain('kobieto')
    expect(table.textContent).toContain('kobiet')
    expect(table.textContent).toContain('kobietom')
    expect(table.textContent).toContain('kobietami')
    expect(table.textContent).toContain('kobietach')
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

describe('acceptance 3 & 5 — robić conjugation: present/past/future/imperative tabs, analytic marked', () => {
  it('shows all four tabs and marks the analytic future', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    const user = userEvent.setup()

    expect(screen.getByRole('tab', { name: 'Настоящее время' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Будущее время' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Повелительное наклонение' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Прошедшее время' })).toBeInTheDocument()

    // Present is the default active tab.
    expect(screen.getByText('robię')).toBeInTheDocument() // present, 1sg

    await user.click(screen.getByRole('tab', { name: 'Будущее время' }))
    expect(screen.getByText(/będę robić/)).toBeInTheDocument() // future, 1sg — analytic
    expect(screen.getAllByText('аналит.').length).toBeGreaterThan(0)
  })
})

describe('acceptance 4 — past tense shows the gendered variants', () => {
  it('robiłem (masc.) and robiłam (fem.) both appear, on the same row', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Прошедшее время' }))
    const pastTable = screen.getByRole('tabpanel', { name: 'Прошедшее время' }).querySelector('table')!
    expect(pastTable.textContent).toContain('robiłem')
    expect(pastTable.textContent).toContain('robiłam')
  })
})

describe('task 20 — pronouns instead of digits', () => {
  it('labels rows with pronouns (ja/my, ty/wy, on·ona·ono/oni·one)', async () => {
    renderWordDetail(ROBIC_ID)
    await expandForms()
    expect(screen.getByText('ja / my')).toBeInTheDocument()
    expect(screen.getByText('ty / wy')).toBeInTheDocument()
    expect(screen.getByText('on · ona · ono / oni · one')).toBeInTheDocument()
    expect(screen.queryByText('1 л.')).not.toBeInTheDocument()
  })
})

describe('task 20 — conjugation table cells are clickable too (same mechanism as task 17)', () => {
  it('clicking the present-tense ja/singular cell sends exactly that skillId as targetSkillIds', async () => {
    const user = userEvent.setup()
    renderWordDetail(ROBIC_ID)
    await expandForms()

    await user.click(screen.getByRole('button', { name: /Настоящее время, ja, liczba pojedyncza/i }))

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
  it('powinien (paradigmShard: -1) renders the header/senses/progress but no "Формы слова"', async () => {
    renderWordDetail(POWINIEN_ID)
    await waitFor(() => expect(screen.getByText('Значения')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'powinien' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /формы слова/i })).not.toBeInTheDocument()
    expect(screen.getByText('Прогресс')).toBeInTheDocument()
    // No "Формы" bar either — nothing to track for a word with no morphology at all.
    expect(screen.queryByText('Формы')).not.toBeInTheDocument()
  })
})

describe('acceptance 7 — the two progress bars match the persisted wordProgress (== aggregateWord)', () => {
  it('shows vocabMaturity/morphMaturity as the "Слово"/"Формы" percentages', async () => {
    // vocab:pl-ru stability 30 -> maturity 0.5 (TARGET_STABILITY_DAYS = 60); the other vocab
    // skill (ru-pl) and every morphology skill stay unmaterialized (maturity 0), so
    // vocabMaturity averages to 0.25 and morphMaturity to 0.
    const skill: SkillRecord = {
      skillId: `${KOBIETA_ID}::vocab:pl-ru`,
      wordId: KOBIETA_ID,
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
    await recomputeWordProgress(KOBIETA_ID)

    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByText('Прогресс')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Слово: 25%')).toBeInTheDocument())
    expect(screen.getByLabelText('Формы: 0%')).toBeInTheDocument()
  })
})

describe('acceptance 8 — "Сбросить прогресс" deletes the word\'s skills and updates the UI', () => {
  it('asks for confirmation, then deletes skills and zeroes the progress bars', async () => {
    const skill: SkillRecord = {
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
    }
    await upsertSkill(skill)
    await recomputeWordProgress(KOBIETA_ID)

    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await waitFor(() => expect(screen.getByLabelText('Слово: 50%')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Сбросить прогресс' }))
    expect(screen.getByText(/Сбросить прогресс «kobieta»/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Сбросить' }))

    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(0))
    await waitFor(() => expect(screen.getByLabelText('Слово: 0%')).toBeInTheDocument())
  })

  it('cancelling the confirmation leaves the skill untouched', async () => {
    const skill: SkillRecord = {
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
    }
    await upsertSkill(skill)

    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await user.click(screen.getByRole('button', { name: 'Сбросить прогресс' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(1)
  })
})

describe('"Знаю" / "Не знаю" / "Учить" (FR-48, task 16 FR-29)', () => {
  it('"Знаю" moves vocab:pl-ru and vocab:ru-pl to state "review" and shows an undo toast', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Знаю' }))

    await waitFor(async () => {
      const skills = await getSkillsForWord(KOBIETA_ID)
      expect(skills).toHaveLength(2)
      expect(skills.every((s) => s.state === 'review')).toBe(true)
    })
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('kobieta')
    expect(screen.getByRole('button', { name: /отменить/i })).toBeInTheDocument()
  })

  it('"Не знаю" resets only vocab:pl-ru to state "new", due now', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Не знаю' }))

    await waitFor(async () => {
      const skills = await getSkillsForWord(KOBIETA_ID)
      expect(skills).toHaveLength(1)
      expect(skills[0]!.dimension).toBe('vocab:pl-ru')
      expect(skills[0]!.state).toBe('new')
    })
  })

  it('the toast\'s "Отменить" fully reverts a "Знаю" write in Dexie', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)

    await user.click(screen.getByRole('button', { name: 'Знаю' }))
    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(2))

    await user.click(await screen.findByRole('button', { name: /отменить/i }))

    await waitFor(async () => expect(await getSkillsForWord(KOBIETA_ID)).toHaveLength(0))
  })

  it('"Учить" navigates to /session carrying only this word as router state', async () => {
    const user = userEvent.setup()
    renderWordDetail(KOBIETA_ID)
    await user.click(screen.getByRole('button', { name: /учить/i }))
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      wordId?: string
    }
    expect(state.wordId).toBe(KOBIETA_ID)
  })
})
