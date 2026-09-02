/**
 * `/stats` — `StatsPage` tests (`spec/tasks/23-stats.md` acceptance list).
 *
 * Fixture data goes through real repository functions (`upsertSkill` +
 * `recomputeWordProgress`), never a direct `db.*` write — same discipline as
 * `HomePage.test.tsx`/`words-progress.repository.test.ts`. Words use `paradigmShard: -1`
 * (no paradigm) so nothing here needs a network/fetch mock; the morphology denominator math
 * itself (with a real paradigm) is `stats.repository.test.ts`'s job — this file only checks
 * the page wires numbers/gates through correctly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { StatsPage } from './StatsPage.tsx'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { __resetMorphologyDenominatorsForTest } from '@/db/repositories/stats.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { encodeForm, type PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

function entry(lemma: string, pos: PosValue, rank: number, paradigmShard = -1): WordIndexEntry {
  return { lemma, pos, rank, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard }
}

function vocabSkill(wordId: string, dim: 'vocab:pl-ru' | 'vocab:ru-pl', stability: number): SkillRecord {
  return {
    skillId: `${wordId}::${dim}`,
    wordId,
    kind: 'vocab',
    dimension: dim,
    state: 'review',
    stability,
    difficulty: 3,
    due: 1000,
    reps: 2,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

async function learnWord(wordId: string, stability: number): Promise<void> {
  await upsertSkill(vocabSkill(wordId, 'vocab:pl-ru', stability))
  await upsertSkill(vocabSkill(wordId, 'vocab:ru-pl', stability))
  await recomputeWordProgress(wordId)
}

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  __resetMorphologyDenominatorsForTest()
  __resetLoaderCachesForTest()
  vi.unstubAllGlobals()
  await deleteDatabase()
})

/** Task 27's `ConfusionCard` uses `useNavigate` (its "Потренировать" button) — `StatsPage`
 *  therefore needs a `<Router>` ancestor now, unlike before that card existed. */
function renderStatsPage() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <StatsPage />
    </MemoryRouter>,
  )
}

describe('StatsPage', () => {
  it('fresh install: the whole screen is one empty state, not a wall of zeros', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    renderStatsPage()

    expect(screen.getByRole('heading', { name: 'Прогресс' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Пока нет данных')).toBeInTheDocument())
    expect(screen.queryByText('По уровням')).not.toBeInTheDocument()
    expect(screen.queryByText('Известно слов')).not.toBeInTheDocument()
  })

  it('shows known/learning totals and level/POS percentages once there is progress', async () => {
    initIndexStore([
      entry('kot', 'NOUN', 1),
      entry('pies', 'NOUN', 2),
      entry('kobieta', 'NOUN', 3),
      entry('być', 'VERB', 4),
    ])
    await openDatabase()
    await learnWord('kot|NOUN', 10) // learning
    await learnWord('kobieta|NOUN', 60) // mastered -> known
    await learnWord('być|VERB', 60) // mastered -> known

    renderStatsPage()

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument()) // "Известно слов"
    expect(screen.getByText('1')).toBeInTheDocument() // "Изучается"
    // "По уровням": A1 has 2 known out of 4 NOUN+VERB words in the index -> 50%.
    expect(screen.getByText('A1')).toBeInTheDocument()
    // "Части речи": NOUN 1/3, VERB 1/1.
    expect(screen.getByText('NOUN')).toBeInTheDocument()
    expect(screen.getByText('VERB')).toBeInTheDocument()
  })

  it('hides the morphology blocks until noun/verb skills are materialized, and shows the noun block once one is', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1)])
    await openDatabase()
    await learnWord('kobieta|NOUN', 25) // known, vocab-only so far

    renderStatsPage()
    await waitFor(() => expect(screen.getByText('По уровням')).toBeInTheDocument())
    expect(screen.queryByText('Падежи')).not.toBeInTheDocument()
    expect(screen.queryByText('Времена глаголов')).not.toBeInTheDocument()

    await upsertSkill({
      skillId: 'kobieta|NOUN::noun:sg:genitive',
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:genitive',
      state: 'review',
      stability: 30,
      difficulty: 3,
      due: 1000,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    await waitFor(() => expect(screen.getByText('Падежи')).toBeInTheDocument())
    expect(screen.queryByText('Времена глаголов')).not.toBeInTheDocument()
  })

  // Task 27 (`spec/tasks/27-context-and-error-analysis.md` §1, FR-104/FR-105).
  it('shows the confusion card once a case-pair mistake pattern crosses the significance threshold', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1, 0)]) // paradigmShard 0 — needs the fetch stub below
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          'kobieta|NOUN': {
            forms: [
              encodeForm({ form: 'kobieta', number: 'singular', case: 'nominative' }),
              encodeForm({ form: 'kobiety', number: 'singular', case: 'genitive' }),
              encodeForm({ form: 'kobiecie', number: 'singular', case: 'locative' }),
            ],
          },
        }),
      })) as unknown as typeof fetch,
    )
    await openDatabase()
    await learnWord('kobieta|NOUN', 10)
    await upsertSkill({
      skillId: 'kobieta|NOUN::noun:sg:locative',
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:locative',
      state: 'review',
      stability: 10,
      difficulty: 3,
      due: 1000,
      reps: 3,
      lapses: 1,
      correct: 0,
      incorrect: 3,
      createdAt: 0,
      updatedAt: 0,
    })

    const { db } = await import('@/db/database.ts')
    await db.reviewLogs.bulkAdd(
      Array.from({ length: 3 }, (_, i) => ({
        sessionId: 1,
        skillId: 'kobieta|NOUN::noun:sg:locative',
        wordId: 'kobieta|NOUN',
        exerciseType: 'form-choice',
        reviewedAt: i,
        rating: 1 as const,
        correct: false,
        answerGiven: 'kobiety',
        expected: 'kobiecie',
        elapsedMs: 1000,
        srsApplied: true,
      })),
    )

    renderStatsPage()
    await waitFor(() => expect(screen.getByText('Частая путаница')).toBeInTheDocument())
    expect(screen.getByText(/Ты часто путаешь/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Потренировать' })).toBeInTheDocument()
  })

  it('does not show the confusion card when there is no such mistake pattern', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1)])
    await openDatabase()
    await learnWord('kobieta|NOUN', 10)

    renderStatsPage()
    await waitFor(() => expect(screen.getByText('По уровням')).toBeInTheDocument())
    expect(screen.queryByText('Частая путаница')).not.toBeInTheDocument()
  })
})
