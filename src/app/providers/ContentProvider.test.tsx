import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContentProvider } from './ContentProvider.tsx'
import { useContent } from './content-context.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { __resetIndexStoreForTest } from '@/content/index-store.ts'

const REAL_CODEC = {
  pos: ['NOUN', 'VERB', 'ADJ', 'ADV'],
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
    shards: { senses: 16, paradigms: 64 },
    codec: REAL_CODEC,
  }
}

const rawIndexRows = [['kobieta|NOUN', 1, 95, 1, 'женщина', 10, 42]]

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

beforeEach(() => {
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
})

afterEach(() => {
  // Vitest's `test.globals` is off (see vite.config.ts), so `@testing-library/react`'s
  // automatic afterEach-cleanup registration (which looks for a global `afterEach`) never
  // fires — without this, a second `render()` in the same file leaves the first render's
  // DOM behind and every `screen` query becomes ambiguous.
  cleanup()
  vi.unstubAllGlobals()
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
