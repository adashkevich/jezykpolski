/**
 * `/` — `HomePage` tests (`spec/tasks/15-home-screen.md` acceptance list).
 *
 * Fixture data goes through real repository functions (`upsertSkill` +
 * `recomputeWordProgress`), never a direct `db.*` write — this file lives outside
 * `src/db/**`, so it's held to the same `no-restricted-imports` rule as any consumer
 * (acceptance point 7). Words use `paradigmShard: -1` (no paradigm) so
 * `recomputeWordProgress`'s content lookup never needs a network/fetch mock — same trick as
 * `words-progress.repository.test.ts`. Both vocab dimensions get the same `stability` so
 * `vocabMaturity = stability / 60` exactly (`aggregate.ts#TARGET_STABILITY_DAYS`).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { HomePage } from './HomePage.tsx'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { recomputeWordProgress } from '@/db/repositories/words-progress.repository.ts'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'
import type { PosValue } from '@/content/codec.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'

function entry(lemma: string, pos: PosValue, rank: number): WordIndexEntry {
  return { lemma, pos, rank, level: 'A1', primaryRu: 'x', sensesShard: 0, paradigmShard: -1 }
}

function vocabSkill(
  wordId: string,
  dim: 'vocab:pl-ru' | 'vocab:ru-pl',
  stability: number,
  due: number,
): SkillRecord {
  return {
    skillId: `${wordId}::${dim}`,
    wordId,
    kind: 'vocab',
    dimension: dim,
    state: 'review',
    stability,
    difficulty: 3,
    due,
    reps: 2,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** Writes both vocab skills at the same `stability` and recomputes `wordProgress` for
 *  `wordId`. `due` defaults to far in the past (already due), matching the common case
 *  where "has progress" and "has something due" go together in these tests. */
async function learnWord(wordId: string, stability: number, due = 1000): Promise<void> {
  await upsertSkill(vocabSkill(wordId, 'vocab:pl-ru', stability, due))
  await upsertSkill(vocabSkill(wordId, 'vocab:ru-pl', stability, due))
  await recomputeWordProgress(wordId)
}

/** Surfaces the pushed route + the filters store's current `pos` so a test can assert what
 *  "Открыть"/a POS row actually did, without needing the real `WordsListPage`. */
function WordsRouteProbe() {
  const location = useLocation()
  const pos = useFiltersStore((s) => s.pos)
  return (
    <div>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="pos-filter">{pos ?? 'ALL'}</p>
    </div>
  )
}

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/words" element={<WordsRouteProbe />} />
        <Route path="/session" element={<p data-testid="path">/session</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(async () => {
  cleanup()
  __resetIndexStoreForTest()
  await deleteDatabase()
})

describe('HomePage', () => {
  it('fresh install: shows the onboarding CTA, not "0 готовы к повторению"', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Начать обучение' })).toBeInTheDocument(),
    )
    expect(screen.queryByText(/0 слов/)).not.toBeInTheDocument()
    expect(screen.queryByText(/готов/)).not.toBeInTheDocument()
  })

  it('existing progress but nothing due: CTA switches to "Учить новые слова", no bare zero', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1)])
    await openDatabase()
    // Learned, but due far in the future -> countDue() is 0 even though progress exists.
    await learnWord('kobieta|NOUN', 60, Date.now() + 999_999_999)

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Учить новые слова' })).toBeInTheDocument(),
    )
    expect(screen.queryByText(/0.*готов/)).not.toBeInTheDocument()
  })

  it('due reviews pending: CTA reads "Продолжить обучение" with the real due count', async () => {
    initIndexStore([entry('kobieta', 'NOUN', 1)])
    await openDatabase()
    await learnWord('kobieta|NOUN', 10) // learning, due in the past by default (both vocab skills)

    renderHomePage()

    // Two due skills (vocab:pl-ru + vocab:ru-pl), not two words — countDue counts skills.
    await waitFor(() => expect(screen.getByText(/2 слова готовы к повторению/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Продолжить обучение' })).toBeInTheDocument()
  })

  it('has exactly one primary (large) CTA button on the screen', async () => {
    initIndexStore([entry('kot', 'NOUN', 1), entry('być', 'VERB', 2), entry('dobry', 'ADJ', 3)])
    await openDatabase()

    const { container } = renderHomePage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /обучение/ })).toBeInTheDocument(),
    )

    expect(container.querySelectorAll('[data-size="lg"]')).toHaveLength(1)
  })

  it('section counters match the wordProgress summary and the content index totals', async () => {
    initIndexStore([
      entry('kot', 'NOUN', 1),
      entry('pies', 'NOUN', 2),
      entry('kobieta', 'NOUN', 3),
      entry('być', 'VERB', 4),
    ])
    await openDatabase()
    await learnWord('kot|NOUN', 10) // learning
    await learnWord('kobieta|NOUN', 60) // mastered -> "выучено"
    await learnWord('być|VERB', 60) // mastered -> "выучено"

    renderHomePage()

    await waitFor(() => expect(screen.getByText(/1 изучается/)).toBeInTheDocument())
    expect(screen.getByText(/2 выучено/)).toBeInTheDocument()
    // "Существительные": 1 learned (kobieta) out of 3 nouns in the index (kot, pies, kobieta).
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    // "Глаголы": 1 learned (być) out of 1 verb in the index.
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    // "Прилагательные": no adjectives in the fixture index at all.
    expect(screen.getByText('0 / 0')).toBeInTheDocument()
  })

  it('"Открыть" opens /words with the POS filter cleared', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()
    useFiltersStore.getState().setPos('VERB')

    renderHomePage()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Открыть' })).toBeInTheDocument())
    screen.getByRole('button', { name: 'Открыть' }).click()

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/words'))
    expect(screen.getByTestId('pos-filter')).toHaveTextContent('ALL')
  })

  it('a POS row sets the filters store and opens /words scoped to that part of speech', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    renderHomePage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Существительные/ })).toBeInTheDocument(),
    )
    screen.getByRole('button', { name: /Существительные/ }).click()

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/words'))
    expect(screen.getByTestId('pos-filter')).toHaveTextContent('NOUN')
  })

  it('the CTA always navigates to /session with no setup screen', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    renderHomePage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Начать обучение' })).toBeInTheDocument(),
    )
    screen.getByRole('button', { name: 'Начать обучение' }).click()

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/session'))
  })

  it('"Сегодня" shows zero activity without a stray percent sign', async () => {
    initIndexStore([entry('kot', 'NOUN', 1)])
    await openDatabase()

    renderHomePage()

    await waitFor(() => expect(screen.getByText(/0 повторений/)).toBeInTheDocument())
    expect(screen.getByText(/0 новых слов/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
})
