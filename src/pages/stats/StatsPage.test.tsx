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
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { StatsPage } from './StatsPage.tsx'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { __resetMorphologyDenominatorsForTest } from '@/db/repositories/stats.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

function entry(lemma: string, pos: PosValue, rank: number): WordIndexEntry {
  return { lemma, pos, rank, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard: -1 }
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
  await deleteDatabase()
})

describe('StatsPage', () => {
  it('fresh install: the whole screen is one empty state, not a wall of zeros', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    render(<StatsPage />)

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

    render(<StatsPage />)

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

    render(<StatsPage />)
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
})
