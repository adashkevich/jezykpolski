/**
 * `LangProfileGate` (`spec/tasks/52-language-onboarding.md` §1, §3): the first-run language
 * screen shows instead of the app until `settings.langProfile` holds a known language; the
 * stored languages are the only "already asked" record; the read happens once per load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LangProfileGate } from './LangProfileGate.tsx'
import {
  __resetIndexStoreForTest,
  getIndexStoreLangs,
  initIndexStore,
} from '@/content/index-store.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { LANG_PROFILE_SETTING_KEY } from '@/learning/session/lang-profile.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'

function renderGate() {
  return render(
    <LangProfileGate>
      <p>app-content</p>
    </LangProfileGate>,
  )
}

beforeEach(async () => {
  // The gate sits inside `ContentProvider` in the app, so the index store already exists.
  initIndexStore([
    {
      lemma: 'kot',
      pos: 'NOUN',
      rank: 1,
      level: 'A1',
      levels: uniformLevels('A1'),
      primaryRu: 'кот',
      sensesShard: 0,
      paradigmShard: -1,
    },
  ])
  await openDatabase()
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  __resetIndexStoreForTest()
  await deleteDatabase()
})

describe('LangProfileGate', () => {
  it('shows the language screen instead of the app when no answer was ever stored', async () => {
    renderGate()

    expect(await screen.findByRole('heading', { name: 'Какие языки вы знаете?' })).toBeVisible()
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
  })

  it('shows the loading screen, not the app and not the question, while the setting is read', async () => {
    renderGate()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await screen.findByRole('group', { name: 'Какие языки вы знаете?' })
  })

  it('stores Russian alone when the screen is confirmed as it opened, and opens the app', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole('button', { name: 'Продолжить' }))

    await waitFor(() => expect(screen.getByText('app-content')).toBeInTheDocument())
    expect(await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)).toEqual(['ru'])
    expect(getIndexStoreLangs()).toEqual(['ru'])
  })

  it('stores every ticked language as a list, applies it to the index and opens the app', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole('checkbox', { name: /беларуский/ }))
    await user.click(screen.getByRole('checkbox', { name: /украинский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    await waitFor(() => expect(screen.getByText('app-content')).toBeInTheDocument())
    expect(screen.queryByRole('group', { name: 'Какие языки вы знаете?' })).not.toBeInTheDocument()
    expect(await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)).toEqual([
      'ru',
      'by',
      'ua',
    ])
    // Applied before the app's first frame, not left to `ContentProvider`'s live query.
    expect(getIndexStoreLangs()).toEqual(['ru', 'by', 'ua'])
  })

  it('stores an answer without Russian as it is', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole('checkbox', { name: /беларуский/ }))
    await user.click(screen.getByRole('checkbox', { name: /русский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    await waitFor(() => expect(screen.getByText('app-content')).toBeInTheDocument())
    expect(await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)).toEqual(['by'])
    expect(getIndexStoreLangs()).toEqual(['by'])
  })

  it.each([['ru'], ['by'], ['ua'], [['ru']], [['by', 'ua']], [['ua']]] as const)(
    'goes straight to the app when %j is already stored — the screen never repeats',
    async (stored) => {
      await settingsRepo.set(LANG_PROFILE_SETTING_KEY, stored)
      renderGate()

      expect(await screen.findByText('app-content')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Какие языки вы знаете?' }),
      ).not.toBeInTheDocument()
    },
  )

  it.each([['pl'], [[]], [['pl']], [7]] as const)(
    'asks again when the stored value %j holds no known language (a foreign or hand-edited backup)',
    async (stored) => {
      await settingsRepo.set(LANG_PROFILE_SETTING_KEY, stored)
      renderGate()

      expect(await screen.findByRole('group', { name: 'Какие языки вы знаете?' })).toBeInTheDocument()
      expect(screen.queryByText('app-content')).not.toBeInTheDocument()
    },
  )

  it('reads the setting once per load — a later change to it does not bring the screen back', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['ru', 'by'])
    renderGate()
    expect(await screen.findByText('app-content')).toBeInTheDocument()

    await act(async () => {
      await settingsRepo.remove(LANG_PROFILE_SETTING_KEY)
    })

    expect(screen.getByText('app-content')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Какие языки вы знаете?' })).not.toBeInTheDocument()
  })

  it('opens the app without the screen when the setting cannot be read (a preference must not block start)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(settingsRepo, 'get').mockRejectedValue(new Error('idb broke'))
    renderGate()

    expect(await screen.findByText('app-content')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Какие языки вы знаете?' })).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps the screen up, with an error, when the choice cannot be stored', async () => {
    const user = userEvent.setup()
    vi.spyOn(settingsRepo, 'set').mockRejectedValue(new Error('quota'))
    renderGate()

    await user.click(await screen.findByRole('checkbox', { name: /беларуский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить выбор')
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
    // Nothing was applied that isn't stored.
    expect(getIndexStoreLangs()).toEqual(['ru'])
  })
})
