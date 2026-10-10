/**
 * "Обучение" block — the «Языки, которые я знаю» checkboxes (`spec/tasks/51-language-profile.md`
 * §1, made a set of languages by `52-language-onboarding.md`): where they sit, what they store,
 * how a bad stored value reads, and — inside a real `ContentProvider` next to the home screen's
 * `LearnHero` — that a change applies at once and leaves the start level and the progress alone
 * (§2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { LearningSettingsSection } from './LearningSettingsSection.tsx'
import { ContentProvider } from '@/app/providers/ContentProvider.tsx'
import { LearnHero } from '@/features/learn/components/LearnHero.tsx'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import {
  getAllWordProgress,
  recomputeWordProgress,
} from '@/db/repositories/words-progress.repository.ts'
import { LANG_PROFILE_SETTING_KEY } from '@/learning/session/lang-profile.ts'
import { NEW_WORDS_START_LEVEL_SETTING_KEY } from '@/learning/session/level-gate.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'

beforeEach(async () => {
  await openDatabase()
})

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

function langsGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Языки, которые я знаю' })
}

function langBox(name: RegExp): HTMLInputElement {
  return within(langsGroup()).getByRole('checkbox', { name })
}

const storedLangs = () => settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, null)

describe('LearningSettingsSection — «Языки, которые я знаю» (tasks 51, 52)', () => {
  it('sits right above «Начинать с уровня», offers the three languages and defaults to Russian only', async () => {
    render(<LearningSettingsSection />)

    await waitFor(() => expect(langBox(/русский/)).toBeChecked())
    expect(within(langsGroup()).getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual([
      'Знаю русский',
      'Знаю беларуский',
      'Знаю украинский',
    ])
    expect(langBox(/беларуский/)).not.toBeChecked()
    expect(langBox(/украинский/)).not.toBeChecked()

    const startLevel = screen.getByRole('combobox', { name: 'Начинать с уровня' })
    expect(
      langsGroup().compareDocumentPosition(startLevel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('ticking a language stores the list under "langProfile", in ru, by, ua order', async () => {
    const user = userEvent.setup()
    render(<LearningSettingsSection />)
    await waitFor(() => expect(langBox(/русский/)).toBeChecked())

    await user.click(langBox(/украинский/))
    await waitFor(async () => expect(await storedLangs()).toEqual(['ru', 'ua']))

    await user.click(langBox(/беларуский/))
    await waitFor(async () => expect(await storedLangs()).toEqual(['ru', 'by', 'ua']))
    // Controlled by the setting's live query, which re-renders a tick after the write lands.
    await waitFor(() => expect(langBox(/беларуский/)).toBeChecked())
  })

  it('Russian can be un-ticked once another language is ticked', async () => {
    const user = userEvent.setup()
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['ru', 'by'])
    render(<LearningSettingsSection />)
    await waitFor(() => expect(langBox(/беларуский/)).toBeChecked())

    await user.click(langBox(/русский/))

    await waitFor(async () => expect(await storedLangs()).toEqual(['by']))
    await waitFor(() => expect(langBox(/русский/)).not.toBeChecked())
  })

  it('the last ticked language cannot be un-ticked — at least one stays', async () => {
    const user = userEvent.setup()
    render(<LearningSettingsSection />)
    await waitFor(() => expect(langBox(/русский/)).toBeChecked())

    expect(langBox(/русский/)).toBeDisabled()
    await user.click(langBox(/русский/))
    expect(langBox(/русский/)).toBeChecked()
    expect(await storedLangs()).toBeNull()

    // Ticking another one frees it again.
    await user.click(langBox(/украинский/))
    await waitFor(() => expect(langBox(/русский/)).toBeEnabled())
  })

  it('shows a stored list as ticked boxes — also one without Russian', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, ['by', 'ua'])
    render(<LearningSettingsSection />)

    await waitFor(() => expect(langBox(/беларуский/)).toBeChecked())
    expect(langBox(/украинский/)).toBeChecked()
    expect(langBox(/русский/)).not.toBeChecked()
  })

  it('reads task 51\'s single string: "ua" is Russian + Ukrainian', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'ua')
    render(<LearningSettingsSection />)

    await waitFor(() => expect(langBox(/украинский/)).toBeChecked())
    expect(langBox(/русский/)).toBeChecked()
    expect(langBox(/беларуский/)).not.toBeChecked()
  })

  it('shows an invalid stored value as Russian only', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'pl')
    render(<LearningSettingsSection />)

    await waitFor(() => expect(langBox(/русский/)).toBeChecked())
    expect(langBox(/беларуский/)).not.toBeChecked()
    expect(langBox(/украинский/)).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// Real `index.json` rows: `uśmiech` is A2 for ru but A1 for by/ua; `radzić` is B1 for ru, A2 for
// by/ua. `kot` is started, so in ru A1 is done and the gate is on A2; in ua `uśmiech` joins A1.
// ---------------------------------------------------------------------------

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

const RAW_INDEX_ROWS = [
  ['kot|NOUN', 1, 1, 1, 1, 1, 'кот', 0, -1],
  ['uśmiech|NOUN', 1, 1008, 2, 1, 1, 'улыбка', 3, -1],
  ['radzić|VERB', 2, 1016, 3, 2, 2, 'советовать', 15, -1],
]

/** The same three rows decoded — to write progress before `ContentProvider` has loaded. */
const DECODED_ENTRIES: WordIndexEntry[] = [
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
  {
    lemma: 'uśmiech',
    pos: 'NOUN',
    rank: 1008,
    level: 'A2',
    levels: { ru: 'A2', by: 'A1', ua: 'A1' },
    primaryRu: 'улыбка',
    sensesShard: 3,
    paradigmShard: -1,
  },
  {
    lemma: 'radzić',
    pos: 'VERB',
    rank: 1016,
    level: 'B1',
    levels: { ru: 'B1', by: 'A2', ua: 'A2' },
    primaryRu: 'советовать',
    sensesShard: 15,
    paradigmShard: -1,
  },
]

function stubContentFetch() {
  const manifest = {
    contentVersion: 'abcdef123456',
    generatedAt: '2026-09-01T05:18:06+00:00',
    counts: { words: 3, paradigms: 0, forms: 0 },
    shards: { senses: 16, senseDetails: 16, paradigms: 64 },
    codec: REAL_CODEC,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url)
      if (href.includes('manifest.json'))
        return { ok: true, json: async () => manifest } as Response
      if (href.includes('index.json'))
        return { ok: true, json: async () => RAW_INDEX_ROWS } as Response
      // Background prewarm/cleanup and anything else: harmless empty answers.
      return { ok: true, json: async () => ({}) } as Response
    }),
  )
}

function vocabSkill(dimension: SkillRecord['dimension']): SkillRecord {
  return {
    skillId: `kot|NOUN::${dimension}`,
    wordId: 'kot|NOUN',
    kind: 'vocab',
    dimension,
    state: 'review',
    stability: 10,
    difficulty: 3,
    due: Date.now() + 999_999_999,
    reps: 2,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('changing the languages in a running app (task 51 §2)', () => {
  it('applies at once — the home gate moves from A2 back to A1 — and keeps startLevel and progress', async () => {
    const user = userEvent.setup()
    initIndexStore(DECODED_ENTRIES)
    for (const dimension of ['vocab:pl-ru', 'vocab:ru-pl-choice', 'vocab:ru-pl-input'] as const) {
      await upsertSkill(vocabSkill(dimension))
    }
    await recomputeWordProgress('kot|NOUN')
    await settingsRepo.set(NEW_WORDS_START_LEVEL_SETTING_KEY, 'A1')
    const progressBefore = await getAllWordProgress()
    stubContentFetch()

    render(
      <ContentProvider>
        <MemoryRouter>
          <LearningSettingsSection />
          <LearnHero />
        </MemoryRouter>
      </ContentProvider>,
    )

    // ru: kot is the only A1 word and it is started — the gate is on A2 (uśmiech).
    await waitFor(() =>
      expect(screen.getByText('Сейчас изучаем: A2 · осталось 1 слово')).toBeInTheDocument(),
    )

    await user.click(langBox(/украинский/))

    // ua: uśmiech is A1 and not started — the gate recomputes on its own, no reload.
    await waitFor(() =>
      expect(screen.getByText('Сейчас изучаем: A1 · осталось 1 слово')).toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Начинать с уровня' })).toHaveValue('A1')
    expect(await settingsRepo.get(NEW_WORDS_START_LEVEL_SETTING_KEY, null)).toBe('A1')
    expect(await getAllWordProgress()).toEqual(progressBefore)
  })
})
