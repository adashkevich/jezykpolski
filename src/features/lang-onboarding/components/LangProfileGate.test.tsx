/**
 * `LangProfileGate` (`spec/tasks/52-language-onboarding.md` §1, §3): the first-run language
 * screen shows instead of the app until `settings.langProfile` holds a known profile; the
 * stored profile is the only "already asked" record; the read happens once per load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LangProfileGate } from './LangProfileGate.tsx'
import {
  __resetIndexStoreForTest,
  getIndexStoreProfile,
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
  it('shows the language screen instead of the app when no profile was ever stored', async () => {
    renderGate()

    expect(await screen.findByRole('heading', { name: 'Какой язык вы знаете?' })).toBeVisible()
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
  })

  it('shows the loading screen, not the app and not the question, while the setting is read', async () => {
    renderGate()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await screen.findByRole('radiogroup')
  })

  it('stores "by" for the Belarusian card, applies it to the index and opens the app', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole('radio', { name: /Белорусский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    await waitFor(() => expect(screen.getByText('app-content')).toBeInTheDocument())
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)).toBe('by')
    // Applied before the app's first frame, not left to `ContentProvider`'s live query.
    expect(getIndexStoreProfile()).toBe('by')
  })

  it('stores "ru" explicitly for the Russian card — the answer, not the absence of one', async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole('radio', { name: /Русский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    await waitFor(() => expect(screen.getByText('app-content')).toBeInTheDocument())
    expect(await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)).toBe('ru')
    expect(getIndexStoreProfile()).toBe('ru')
  })

  it.each(['ru', 'by', 'ua'] as const)(
    'goes straight to the app when "%s" is already stored — the screen never repeats',
    async (stored) => {
      await settingsRepo.set(LANG_PROFILE_SETTING_KEY, stored)
      renderGate()

      expect(await screen.findByText('app-content')).toBeInTheDocument()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Какой язык вы знаете?' })).not.toBeInTheDocument()
    },
  )

  it('asks again when the stored value is no known profile (a foreign or hand-edited backup)', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'pl')
    renderGate()

    expect(await screen.findByRole('radiogroup')).toBeInTheDocument()
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
  })

  it('reads the setting once per load — a later change to it does not bring the screen back', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'by')
    renderGate()
    expect(await screen.findByText('app-content')).toBeInTheDocument()

    await act(async () => {
      await settingsRepo.remove(LANG_PROFILE_SETTING_KEY)
    })

    expect(screen.getByText('app-content')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('opens the app without the screen when the setting cannot be read (a preference must not block start)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(settingsRepo, 'get').mockRejectedValue(new Error('idb broke'))
    renderGate()

    expect(await screen.findByText('app-content')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
  })

  it('keeps the screen up, with an error, when the choice cannot be stored', async () => {
    const user = userEvent.setup()
    vi.spyOn(settingsRepo, 'set').mockRejectedValue(new Error('quota'))
    renderGate()

    await user.click(await screen.findByRole('radio', { name: /Белорусский/ }))
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить выбор')
    expect(screen.queryByText('app-content')).not.toBeInTheDocument()
    // Nothing was applied that isn't stored.
    expect(getIndexStoreProfile()).toBe('ru')
  })
})
