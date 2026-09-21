/**
 * `SessionMatchingBlock` (`spec/tasks/40-vocab-streak-progression.md` §4) — the daily
 * session's own "Сопоставление" screen. Same DB-integration convention as
 * `useMatchingPracticeSession.test.ts` (real fake-indexeddb via `lifecycle.repository.ts`,
 * stubbed empty senses fetch), plus a real `useSessionStore` since this component writes
 * straight into it (`seedFirstAnswers`/`advance`) instead of owning its own session state.
 *
 * Uses a 5-pair batch, same as `useMatchingPracticeSession.test.ts`. Task 44
 * (`spec/tasks/44-matching-credit-all-but-mistaken.md`) — every correct pair is graded except
 * one whose word took part in a wrong pairing (`lexical-batch.ts#shouldGradeMatch`, applied by
 * the real `MatchingExercise` these tests drive through the DOM, so the block and
 * `/practice/matching` share one rule). A no-mistake batch grades all 5, the last two included.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionMatchingBlock } from './SessionMatchingBlock.tsx'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { Exercise, ExerciseInstance, MatchingPairSource } from '@/learning/exercises/exercise.types.ts'
import { encodeWordId, type SkillId } from '@/learning/skills/skill-id.ts'
import { useSessionStore } from '@/stores/session.store.ts'
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

const PAIRS: MatchingPairSource[] = WORDS.map(({ lemma, ru }) => ({
  wordId: encodeWordId(lemma, 'NOUN'),
  pl: lemma,
  ru,
}))

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const DOM_ID = encodeWordId('dom', 'NOUN')
const KOT_ID = encodeWordId('kot', 'NOUN')
const PIES_ID = encodeWordId('pies', 'NOUN')
const OKNO_ID = encodeWordId('okno', 'NOUN')

const MATCHING_EXERCISE: Extract<Exercise, { type: 'matching' }> = { type: 'matching', pairs: PAIRS }

const INSTANCE: ExerciseInstance = {
  id: 'matching::1',
  skillId: 'matching::1',
  exercise: MATCHING_EXERCISE,
}

function stubEmptySensesFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response),
  )
}

/** Matches every PL/RU pair, in `WORDS` order — the only way `MatchingExercise` ever shows
 *  its "Готово" button (`allMatched`). */
async function matchAllPairs(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (const { lemma, ru } of WORDS) {
    await user.click(screen.getByRole('button', { name: lemma }))
    await user.click(screen.getByRole('button', { name: ru }))
  }
}

/** Ждёт конца красной вспышки неверной пары (500 мс в `MatchingExercise`): пока она идёт,
 *  клики по плиткам игнорируются. */
async function waitOutWrongFlash(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
  })
}

/** Все сопоставления пишут в БД асинхронно — тест не должен закончиться раньше записи,
 *  иначе `afterEach` закроет базу под её ногами. */
async function waitForSkillWrites(wordIds: readonly string[]): Promise<void> {
  for (const wordId of wordIds) {
    await waitFor(async () => {
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    })
  }
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  initIndexStore(WORDS.map(({ lemma, ru }) => entry(lemma, ru)))
  stubEmptySensesFetch()
  await openDatabase()
  useSessionStore.getState().reset()
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('SessionMatchingBlock', () => {
  it('grades a correct pair (both directions) and mirrors it into the session store', async () => {
    const user = userEvent.setup()
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'женщина' }))

    await waitFor(async () => {
      expect((await getSkill(`${KOBIETA_ID}::vocab:pl-ru`))?.correct).toBe(1)
    })
    expect((await getSkill(`${KOBIETA_ID}::vocab:ru-pl-choice`))?.correct).toBe(1)

    const firstAnswers = useSessionStore.getState().firstAnswerBySkill
    expect(firstAnswers.has(`${KOBIETA_ID}::vocab:pl-ru` as SkillId)).toBe(true)
    expect(firstAnswers.has(`${KOBIETA_ID}::vocab:ru-pl-choice` as SkillId)).toBe(true)
  })

  // Task 44 — no mistakes: every pair is graded, including the last two (task 36 excluded them).
  it('grades every pair of a batch with no mistakes, including the last two', async () => {
    const user = userEvent.setup()
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    await matchAllPairs(user)
    await waitForSkillWrites([KOBIETA_ID, DOM_ID, KOT_ID, PIES_ID, OKNO_ID])

    for (const wordId of [KOBIETA_ID, DOM_ID, KOT_ID, PIES_ID, OKNO_ID]) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    }
    expect(await getLogsForSession(1)).toHaveLength(10)
    expect(useSessionStore.getState().firstAnswerBySkill.size).toBe(10)
  })

  // Task 44 — A_pl -> B_ru is a mistake: A and B are matched afterwards but never credited,
  // nothing about them reaches the session store; C, D, E are credited as usual.
  it('does not grade the two words of a wrong pairing, grades every other word', async () => {
    const user = userEvent.setup()
    const newSkillIdsRef = { current: new Set<SkillId>() }
    render(<SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={newSkillIdsRef} />)

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'дом' }))
    await waitOutWrongFlash()

    await matchAllPairs(user)
    await waitForSkillWrites([KOT_ID, PIES_ID, OKNO_ID])

    for (const wordId of [KOBIETA_ID, DOM_ID]) {
      expect(await getSkill(`${wordId}::vocab:pl-ru`)).toBeUndefined()
      expect(await getSkill(`${wordId}::vocab:ru-pl-choice`)).toBeUndefined()
    }
    for (const wordId of [KOT_ID, PIES_ID, OKNO_ID]) {
      expect((await getSkill(`${wordId}::vocab:pl-ru`))?.correct).toBe(1)
      expect((await getSkill(`${wordId}::vocab:ru-pl-choice`))?.correct).toBe(1)
    }
    expect(await getLogsForSession(1)).toHaveLength(6)

    // Сводка сессии видит только засчитанные пары.
    const firstAnswers = useSessionStore.getState().firstAnswerBySkill
    expect(firstAnswers.size).toBe(6)
    expect(firstAnswers.has(`${KOBIETA_ID}::vocab:pl-ru` as SkillId)).toBe(false)
    expect(firstAnswers.has(`${DOM_ID}::vocab:ru-pl-choice` as SkillId)).toBe(false)
    expect(newSkillIdsRef.current.size).toBe(6)
  })

  it('a repeated mistake on an already tainted word changes nothing (a set, not a counter)', async () => {
    const user = userEvent.setup()
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'дом' }))
    await waitOutWrongFlash()
    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'кот' }))
    await waitOutWrongFlash()

    await matchAllPairs(user)
    await waitForSkillWrites([PIES_ID, OKNO_ID])

    // A, B, C запятнаны; D и E — нет.
    for (const wordId of [KOBIETA_ID, DOM_ID, KOT_ID]) {
      expect(await getSkill(`${wordId}::vocab:pl-ru`)).toBeUndefined()
    }
    expect(await getLogsForSession(1)).toHaveLength(4)
  })

  it('tracks new skills into newSkillIdsRef', async () => {
    const user = userEvent.setup()
    const newSkillIdsRef = { current: new Set<SkillId>() }
    render(<SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={newSkillIdsRef} />)

    await user.click(screen.getByRole('button', { name: 'kobieta' }))
    await user.click(screen.getByRole('button', { name: 'женщина' }))

    await waitFor(() => {
      expect(newSkillIdsRef.current.has(`${KOBIETA_ID}::vocab:pl-ru` as SkillId)).toBe(true)
    })
    expect(newSkillIdsRef.current.has(`${KOBIETA_ID}::vocab:ru-pl-choice` as SkillId)).toBe(true)
  })

  it('"Готово" advances the live session queue once every pair is matched', async () => {
    const user = userEvent.setup()
    useSessionStore.getState().startSession({
      sessionId: 1,
      mode: 'learn',
      queue: [INSTANCE],
    })
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    await matchAllPairs(user)
    await waitForSkillWrites([KOBIETA_ID, DOM_ID, KOT_ID, PIES_ID, OKNO_ID])

    const doneButton = await screen.findByRole('button', { name: 'Готово' })
    expect(useSessionStore.getState().currentIndex).toBe(0)
    await user.click(doneButton)
    expect(useSessionStore.getState().currentIndex).toBe(1)
  })

  it('throws if handed a non-matching exercise instance', () => {
    const badInstance: ExerciseInstance = {
      id: 'x',
      skillId: 'x',
      exercise: { type: 'choice', direction: 'pl-ru', prompt: 'a', options: ['a'], correct: 'a' },
    }
    // Suppress React's noisy error-boundary console output for this expected throw.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <SessionMatchingBlock
          instance={badInstance}
          sessionId={1}
          newSkillIdsRef={{ current: new Set() }}
        />,
      ),
    ).toThrow(/expected a "matching" exercise/)
    consoleSpy.mockRestore()
  })
})
