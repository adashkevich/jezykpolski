/**
 * `SessionMatchingBlock` (`spec/tasks/40-vocab-streak-progression.md` §4) — the daily
 * session's own "Сопоставление" screen. Same DB-integration convention as
 * `useMatchingPracticeSession.test.ts` (real fake-indexeddb via `lifecycle.repository.ts`,
 * stubbed empty senses fetch), plus a real `useSessionStore` since this component writes
 * straight into it (`seedFirstAnswers`/`advance`) instead of owning its own session state.
 *
 * Uses a 5-pair batch, same as `useMatchingPracticeSession.test.ts` — `MATCHING_UNGRADED_TAIL`
 * (2) means a 2-pair batch grades NOTHING at all (`lexical-batch.ts#shouldGradeMatch`'s own
 * header); with 5 pairs, indices 0-2 are graded and the last 2 (3, 4) never are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionMatchingBlock } from './SessionMatchingBlock.tsx'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
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
// Index 3 ("pies") falls in the ungraded tail (indices 3-4 of a 5-pair batch) — never graded.
const PIES_ID = encodeWordId('pies', 'NOUN')

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
  it('grades a correct pair (both directions) before the ungraded tail, and mirrors it into the session store', async () => {
    const user = userEvent.setup()
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    // First pairing (index 0) — well before the 2-pair ungraded tail of a 5-pair batch.
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

  it('never grades a pairing that falls in the ungraded tail', async () => {
    const user = userEvent.setup()
    render(
      <SessionMatchingBlock instance={INSTANCE} sessionId={1} newSkillIdsRef={{ current: new Set() }} />,
    )

    await matchAllPairs(user)

    // Give the first 3 (graded) pairings' async writes a moment to land...
    await waitFor(async () => {
      expect((await getSkill(`${KOBIETA_ID}::vocab:pl-ru`))?.correct).toBe(1)
    })
    // ...then confirm the tail pairing (index 3, "pies") never touched vocab at all.
    expect(await getSkill(`${PIES_ID}::vocab:pl-ru`)).toBeUndefined()
    expect(await getSkill(`${PIES_ID}::vocab:ru-pl-choice`)).toBeUndefined()
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
