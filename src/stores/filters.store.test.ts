import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { get as settingsGet, set as settingsSet } from '@/db/repositories/settings.repository.ts'
import { filtersToQuery, useFiltersStore } from './filters.store.ts'
import type { LevelValue } from '@/content/codec.ts'

const DEFAULTS = {
  levels: [] as LevelValue[],
  upToMode: false,
  upToLevel: null,
  pos: null,
  status: null,
  topN: null,
  sort: 'frequency' as const,
  search: '',
}

beforeEach(async () => {
  await openDatabase()
  // The store is a module-level singleton (persist hydration runs once at import), so each
  // test resets its in-memory state explicitly rather than relying on a fresh instance.
  useFiltersStore.setState({ ...DEFAULTS, levels: [], scrollOffset: 0 })
})

afterEach(async () => {
  await deleteDatabase()
})

describe('useFiltersStore', () => {
  it('toggleLevel adds and removes a level from the multi-select set', () => {
    useFiltersStore.getState().toggleLevel('A1')
    expect(useFiltersStore.getState().levels).toEqual(['A1'])
    useFiltersStore.getState().toggleLevel('B2')
    expect(useFiltersStore.getState().levels).toEqual(['A1', 'B2'])
    useFiltersStore.getState().toggleLevel('A1')
    expect(useFiltersStore.getState().levels).toEqual(['B2'])
  })

  it('turning upToMode off clears a previously picked upToLevel', () => {
    useFiltersStore.getState().setUpToMode(true)
    useFiltersStore.getState().setUpToLevel('B1')
    expect(useFiltersStore.getState().upToLevel).toBe('B1')

    useFiltersStore.getState().setUpToMode(false)
    expect(useFiltersStore.getState().upToLevel).toBeNull()
  })

  it('reset restores every persisted field to defaults but leaves scrollOffset alone', () => {
    useFiltersStore.getState().setSearch('kot')
    useFiltersStore.getState().toggleLevel('C1')
    useFiltersStore.getState().setScrollOffset(240)

    useFiltersStore.getState().reset()

    const state = useFiltersStore.getState()
    expect(state.search).toBe('')
    expect(state.levels).toEqual([])
    expect(state.upToMode).toBe(false)
    expect(state.scrollOffset).toBe(240)
  })

  it('writes filter changes through to the settings repository (async, so polled)', async () => {
    useFiltersStore.getState().setSort('alphabetical')
    useFiltersStore.getState().setPos('VERB')

    await waitFor(async () => {
      const stored = await settingsGet<{ state?: { sort?: string; pos?: string } } | null>(
        'wordsListFilters',
        null,
      )
      expect(stored?.state?.sort).toBe('alphabetical')
      expect(stored?.state?.pos).toBe('VERB')
    })
  })

  it('rehydrates filter values that were previously persisted to the settings repository', async () => {
    // Write directly through the repository (bypassing the store's own setItem) so this test
    // exercises exactly the read/rehydrate half of the round trip, independent of the write
    // half covered above — note `useFiltersStore.setState(...)` itself always re-persists
    // (zustand's `persist` middleware wraps `setState` to call `storage.setItem` on every
    // call), so resetting in-memory state via `setState` before rehydrating would clobber
    // the very row being rehydrated from.
    await settingsSet('wordsListFilters', {
      state: { ...DEFAULTS, sort: 'alphabetical', pos: 'VERB' },
      version: 0,
    })

    await useFiltersStore.persist.rehydrate()

    expect(useFiltersStore.getState().sort).toBe('alphabetical')
    expect(useFiltersStore.getState().pos).toBe('VERB')
  })
})

describe('filtersToQuery', () => {
  it('maps upToMode to WordQuery.upToLevel and drops the plain levels list', () => {
    const q = filtersToQuery({ ...DEFAULTS, upToMode: true, upToLevel: 'B1', levels: ['A1'] })
    expect(q.upToLevel).toBe('B1')
    expect(q.levels).toBeUndefined()
  })

  it('maps the plain multi-select levels when upToMode is off', () => {
    const q = filtersToQuery({ ...DEFAULTS, levels: ['A1', 'B2'] })
    expect(q.levels).toEqual(['A1', 'B2'])
    expect(q.upToLevel).toBeUndefined()
  })

  it('wraps single-select pos/status into the one-element arrays WordQuery expects', () => {
    const q = filtersToQuery({ ...DEFAULTS, pos: 'NOUN', status: 'known' })
    expect(q.pos).toEqual(['NOUN'])
    expect(q.status).toEqual(['known'])
  })

  it('treats "Все" (null) pos/status/topN as no filter at all', () => {
    const q = filtersToQuery({ ...DEFAULTS })
    expect(q.pos).toBeUndefined()
    expect(q.status).toBeUndefined()
    expect(q.topN).toBeNull()
  })

  it('treats a blank/whitespace-only search as no search filter', () => {
    const q = filtersToQuery({ ...DEFAULTS, search: '   ' })
    expect(q.search).toBeUndefined()
  })
})
