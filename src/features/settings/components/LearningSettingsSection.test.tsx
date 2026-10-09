/**
 * "Обучение" block — the «Языки, которые я знаю» select (`spec/tasks/51-language-profile.md` §1):
 * where it sits, what it stores, how it reads a bad stored value, and — inside a real
 * `ContentProvider` next to the home screen's `LearnHero` — that a switch applies at once and
 * leaves the start level and the progress alone (§2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

function profileSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Языки, которые я знаю' })
}

describe('LearningSettingsSection — «Языки, которые я знаю» (task 51)', () => {
  it('sits right above «Начинать с уровня», offers the three profiles and defaults to Russian only', async () => {
    render(<LearningSettingsSection />)

    const select = profileSelect()
    await waitFor(() => expect(select).toHaveValue('ru'))
    expect([...select.options].map((o) => [o.value, o.text])).toEqual([
      ['ru', 'Русский'],
      ['by', 'Русский и белорусский'],
      ['ua', 'Русский и украинский'],
    ])

    const comboboxes = screen.getAllByRole('combobox').map((el) => el.getAttribute('aria-label'))
    const at = comboboxes.indexOf('Языки, которые я знаю')
    expect(comboboxes[at + 1]).toBe('Начинать с уровня')
  })

  it('choosing a profile stores it under "langProfile"', async () => {
    const user = userEvent.setup()
    render(<LearningSettingsSection />)
    await waitFor(() => expect(profileSelect()).toHaveValue('ru'))

    await user.selectOptions(profileSelect(), 'Русский и белорусский')

    await waitFor(async () =>
      expect(await settingsRepo.get(LANG_PROFILE_SETTING_KEY, null)).toBe('by'),
    )
    // Controlled by the setting's live query, which re-renders a tick after the write lands.
    await waitFor(() => expect(profileSelect()).toHaveValue('by'))
  })

  it('shows a stored profile, and an invalid stored value as Russian only', async () => {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'ua')
    render(<LearningSettingsSection />)
    await waitFor(() => expect(profileSelect()).toHaveValue('ua'))
    cleanup()

    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, 'pl')
    render(<LearningSettingsSection />)
    await waitFor(() => expect(profileSelect()).toHaveValue('ru'))
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

describe('switching the profile in a running app (task 51 §2)', () => {
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

    await user.selectOptions(profileSelect(), 'Русский и украинский')

    // ua: uśmiech is A1 and not started — the gate recomputes on its own, no reload.
    await waitFor(() =>
      expect(screen.getByText('Сейчас изучаем: A1 · осталось 1 слово')).toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Начинать с уровня' })).toHaveValue('A1')
    expect(await settingsRepo.get(NEW_WORDS_START_LEVEL_SETTING_KEY, null)).toBe('A1')
    expect(await getAllWordProgress()).toEqual(progressBefore)
  })
})
