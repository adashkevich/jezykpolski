import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContentProvider } from './ContentProvider.tsx'
import { useContent } from './content-context.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { __resetIndexStoreForTest } from '@/content/index-store.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { useContentIndex, useKnownLangs } from '@/hooks/useKnownLangs.ts'
import { LANG_PROFILE_SETTING_KEY } from '@/learning/session/lang-profile.ts'

const REAL_CODEC = {
  pos: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'SCONJ', 'INTJ'],
  level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  number: ['singular', 'plural'],
  case: ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'locative', 'vocative'],
  gender: [
    'feminine',
    'masculine_personal',
    'masculine_inanimate',
    'masculine_animate',
    'neuter',
    'non_masculine_personal',
    'any',
    'masculine_animate_or_personal',
    'masculine_or_neuter',
    'masculine',
  ],
  degree: ['positive', 'comparative', 'superlative'],
  tense: ['present', 'past', 'future'],
  mood: ['indicative', 'imperative', 'infinitive'],
  aspect: ['imperfective', 'perfective'],
  person: [1, 2, 3],
}

function makeManifest() {
  return {
    contentVersion: 'abcdef123456',
    generatedAt: '2026-09-01T05:18:06+00:00',
    counts: { words: 1, paradigms: 1, forms: 1 },
    shards: { senses: 16, senseDetails: 16, paradigms: 64 },
    codec: REAL_CODEC,
  }
}

const rawIndexRows = [['kobieta|NOUN', 1, 95, 1, 1, 1, 'женщина', 10, 42]]

function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

function Probe() {
  const { manifest, wordCount } = useContent()
  return (
    <div>
      contentVersion={manifest.contentVersion}, wordCount={wordCount}
    </div>
  )
}

beforeEach(async () => {
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
  // In the app `DatabaseProvider` opens it first; the provider reads `langProfile` (task 51).
  await openDatabase()
})

afterEach(async () => {
  // Vitest's `test.globals` is off (see vite.config.ts), so `@testing-library/react`'s
  // automatic afterEach-cleanup registration (which looks for a global `afterEach`) never
  // fires — without this, a second `render()` in the same file leaves the first render's
  // DOM behind and every `screen` query becomes ambiguous.
  cleanup()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

describe('ContentProvider', () => {
  it('shows LoadingScreen, then renders children once the index has loaded', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({ 'manifest.json': makeManifest(), 'index.json': rawIndexRows }),
    )
    render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/contentVersion=abcdef123456/)).toBeInTheDocument())
    expect(screen.getByText(/wordCount=1/)).toBeInTheDocument()
  })

  it('shows ErrorState on failure, and retrying recovers once the fetch succeeds', async () => {
    const user = userEvent.setup()
    let shouldFail = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (shouldFail) return { ok: false, status: 500, json: async () => ({}) } as Response
        const href = String(url)
        if (href.includes('manifest.json')) {
          return { ok: true, json: async () => makeManifest() } as Response
        }
        if (href.includes('index.json')) {
          return { ok: true, json: async () => rawIndexRows } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }),
    )

    render(
      <ContentProvider>
        <Probe />
      </ContentProvider>,
    )

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    shouldFail = false
    await user.click(screen.getByRole('button', { name: /spróbuj ponownie/i }))

    await waitFor(() => expect(screen.getByText(/contentVersion=abcdef123456/)).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Task 51 (`spec/tasks/51-language-profile.md` §2): the index follows the `langProfile` setting.
// ---------------------------------------------------------------------------

/** Real `uśmiech|NOUN` row of `public/content/index.json`: A2 for `ru`, A1 for `by` and `ua`. */
const usmiechRows = [['uśmiech|NOUN', 1, 1008, 2, 1, 1, 'улыбка', 3, 35]]

function ProfileProbe() {
  const index = useContentIndex()
  const langs = useKnownLangs()
  return (
    <p data-testid="profile-probe">
      {langs.join('+')}:{index.byId.get('uśmiech|NOUN')?.level}
    </p>
  )
}

function renderWithProfileProbe() {
  vi.stubGlobal(
    'fetch',
    makeFetchMock({ 'manifest.json': makeManifest(), 'index.json': usmiechRows }),
  )
  render(
    <ContentProvider>
      <ProfileProbe />
    </ContentProvider>,
  )
}

describe('ContentProvider — known languages (tasks 51, 52)', () => {
  it('nothing stored: the index is built for Russian only', async () => {
    renderWithProfileProbe()
    await waitFor(() => expect(screen.getByTestId('profile-probe')).toHaveTextContent('ru:A2'))
  })

  it('builds the index for the stored languages before the first screen renders', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['ru', 'ua'])
    renderWithProfileProbe()
    // The very first render of the children already has the ua level — never a ru flash.
    const probe = await screen.findByTestId('profile-probe')
    expect(probe).toHaveTextContent('ru+ua:A1')
  })

  it('an invalid stored value (e.g. from an imported backup) reads as Russian only', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'pl')
    renderWithProfileProbe()
    await waitFor(() => expect(screen.getByTestId('profile-probe')).toHaveTextContent('ru:A2'))
  })

  it('a change of the setting applies while mounted — no reload — and back again', async () => {
    renderWithProfileProbe()
    await waitFor(() => expect(screen.getByTestId('profile-probe')).toHaveTextContent('ru:A2'))

    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['ru', 'by'])
    await waitFor(() => expect(screen.getByTestId('profile-probe')).toHaveTextContent('ru+by:A1'))

    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['ru'])
    await waitFor(() => expect(screen.getByTestId('profile-probe')).toHaveTextContent('ru:A2'))
  })

  it('task 51\'s single-string value still reads: "ua" is Russian + Ukrainian', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'ua')
    renderWithProfileProbe()
    expect(await screen.findByTestId('profile-probe')).toHaveTextContent('ru+ua:A1')
  })

  it('without Russian: a Belarusian-only learner gets the by level', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['by'])
    renderWithProfileProbe()
    expect(await screen.findByTestId('profile-probe')).toHaveTextContent('by:A1')
  })
})
