/**
 * Full-stack smoke test: `App` = `AppProviders` (DB + content readiness, tasks 04/05) wired
 * to `AppRouter` (task 06). `router.test.tsx` covers every route/stub in isolation without
 * providers; this file only has to prove the two are actually connected — that a real
 * `fetch`+IndexedDB-backed boot reaches a rendered page instead of getting stuck on
 * `LoadingScreen`/`ErrorState`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { __resetIndexStoreForTest } from '@/content/index-store.ts'
import * as lifecycle from '@/db/repositories/lifecycle.repository.ts'

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

function stubContentFetch() {
  const manifest = {
    contentVersion: 'abcdef123456',
    generatedAt: '2026-09-01T05:18:06+00:00',
    counts: { words: 1, paradigms: 1, forms: 1 },
    shards: { senses: 16, paradigms: 64 },
    codec: REAL_CODEC,
  }
  const rawIndexRows = [['kobieta|NOUN', 1, 95, 1, 'женщина', 10, 42]]

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url)
      if (href.includes('manifest.json'))
        return { ok: true, json: async () => manifest } as Response
      if (href.includes('index.json'))
        return { ok: true, json: async () => rawIndexRows } as Response
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }),
  )
}

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
  await lifecycle.deleteDatabase().catch(() => {})
})

describe('App', () => {
  it('boots through AppProviders (DB + content) and renders the HomePage route via AppRouter', async () => {
    stubContentFetch()
    render(<App />)

    // Gated on a readiness provider first — nothing app-shaped yet.
    expect(screen.getByRole('status')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Главная' })).toBeInTheDocument(),
    )
    // The shell (top bar + bottom nav) rendered too, not just the bare page.
    expect(screen.getByRole('link', { name: 'Настройки' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
  })
})
