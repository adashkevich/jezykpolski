/**
 * `MatchingPracticePage` (`/practice/matching`, `spec/tasks/27-context-and-error-analysis.md`
 * §4) — task 44 (`spec/tasks/44-matching-credit-all-but-mistaken.md`, FR-55): the standalone
 * screen credits every word of the batch except one whose PL or RU tile took part in a wrong
 * pairing. Drives the real page (`MatchingExercise` + `useMatchingPracticeSession`) through the
 * DOM against fake-indexeddb, the same rule `SessionMatchingBlock.test.tsx` checks for the daily
 * session's block — behaviour must be identical in both. Batch comes from router state, as
 * `TrainingSetupScreen` sends it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchingPracticePage } from './MatchingPracticePage.tsx'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'

function entry(lemma: string, primaryRu: string): WordIndexEntry {
  return { lemma, pos: 'NOUN', rank: 1, level: 'A1', primaryRu, sensesShard: 0, paradigmShard: -1 }
}

const WORDS = [
  { lemma: 'kobieta', ru: 'женщина' },
  { lemma: 'dom', ru: 'дом' },
  { lemma: 'kot', ru: 'кот' },
  { lemma: 'pies', ru: 'собака' },
  { lemma: 'okno', ru: 'окно' },
] as const

const IDS = WORDS.map(({ lemma }) => encodeWordId(lemma, 'NOUN'))
const [KOBIETA_ID, DOM_ID, KOT_ID, PIES_ID, OKNO_ID] = IDS as [string, string, string, string, string]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/practice/matching', state: { wordIds: IDS } }]}>
      <Routes>
        <Route path="/practice/matching" element={<MatchingPracticePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function matchAllPairs(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (const { lemma, ru } of WORDS) {
    await user.click(screen.getByRole('button', { name: lemma }))
    await user.click(screen.getByRole('button', { name: ru }))
  }
}

/** Ждёт конца красной вспышки неверной пары (500 мс): пока она идёт, клики игнорируются. */
async function waitOutWrongFlash(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
  })
}

/** Записи в БД асинхронны — тест не должен закончиться раньше них. */
async function waitForSkillWrites(wordIds: readonly string[]): Promise<void> {
  for (const wordId of wordIds) {
    await waitFor(async () => {
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    })
  }
}

/** «Готово» дожидается `finish()` хука (запись/удаление сессии) — без этого его вызов при
 *  размонтировании гонялся бы с `deleteDatabase()` в `afterEach`. */
async function finishBatch(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Готово' }))
  await screen.findByRole('button', { name: 'Ещё' })
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  initIndexStore(WORDS.map(({ lemma, ru }) => entry(lemma, ru)))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
  )
  await openDatabase()
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('MatchingPracticePage — credit all but mistaken (task 44)', () => {
  it('a batch with no mistakes credits every pair, the last two included', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'kobieta' })

    await matchAllPairs(user)
    await waitForSkillWrites(IDS)
    await finishBatch(user)

    for (const wordId of IDS) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    }
  })

  it('A_pl -> B_ru mistake: A and B are not credited later, the rest are', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: 'kobieta' })

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'дом' }))
    await waitOutWrongFlash()

    await matchAllPairs(user)
    await waitForSkillWrites([KOT_ID, PIES_ID, OKNO_ID])
    await finishBatch(user)

    for (const wordId of [KOBIETA_ID, DOM_ID]) {
      expect(await getSkill(`${wordId}::vocab:pl-ru`)).toBeUndefined()
      expect(await getSkill(`${wordId}::vocab:ru-pl-choice`)).toBeUndefined()
    }
    for (const wordId of [KOT_ID, PIES_ID, OKNO_ID]) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
    }
  })
})
