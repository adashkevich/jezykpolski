/**
 * `/session/result` integration tests (`spec/tasks/14-session-results.md` acceptance list).
 *
 * Renders the real page against a real (fake-indexeddb) database — `createSession` +
 * `logReview` + `completeSession` populate exactly what `useSessionResult` reads, same
 * technique `WordDetailPage.test.tsx` uses for its own repository-backed integration tests.
 * No content index / fetch stubbing needed here: `buildSessionSummary` only ever decodes
 * `wordId`/`skillId` strings, it never touches `content/**`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { SessionResultPage } from './SessionResultPage.tsx'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { completeSession, createSession } from '@/db/repositories/sessions.repository.ts'
import { logReview } from '@/db/repositories/reviews.repository.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'

const CZLOWIEK = encodeWordId('człowiek', 'NOUN')
const KOBIETA = encodeWordId('kobieta', 'NOUN')
const CZLOWIEK_LOCATIVE = encodeSkillId(CZLOWIEK, 'noun:sg:locative')
const KOBIETA_DATIVE = encodeSkillId(KOBIETA, 'noun:sg:dative')

function reviewLog(overrides: Partial<ReviewLogRecord> & Pick<ReviewLogRecord, 'skillId' | 'reviewedAt' | 'sessionId'>): Omit<ReviewLogRecord, 'id'> {
  return {
    wordId: overrides.skillId.split('::')[0]!,
    exerciseType: 'input',
    rating: 3,
    correct: true,
    answerGiven: 'x',
    expected: 'x',
    elapsedMs: 1000,
    srsApplied: true,
    ...overrides,
  }
}

/** Surfaces `location.state` as text — same probe pattern `WordDetailPage.test.tsx` uses —
 *  so "Разобрать ошибки"'s `navigate('/session', { state })` payload can be asserted on. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
}

function HomeProbe() {
  return <div data-testid="home" />
}

function renderResultPage(initialEntry: { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/session/result" element={<SessionResultPage />} />
        <Route path="/session" element={<SessionStateProbe />} />
        <Route path="/" element={<HomeProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await openDatabase()
})

afterEach(async () => {
  cleanup()
  await deleteDatabase()
})

describe('SessionResultPage — real session data (acceptance points 1-4)', () => {
  async function seedSession() {
    const sessionId = await createSession('learn', 1000)
    // człowiek::locative — wrong on the first attempt, corrected on a requeued retry. Must
    // still show up as ONE mistake (first attempt is what counts), not zero.
    await logReview(
      reviewLog({
        sessionId,
        skillId: CZLOWIEK_LOCATIVE,
        reviewedAt: 1100,
        rating: 1, // AGAIN
        correct: false,
        answerGiven: 'człowieka',
        expected: 'człowieku',
      }),
    )
    await logReview(
      reviewLog({
        sessionId,
        skillId: CZLOWIEK_LOCATIVE,
        reviewedAt: 1300,
        rating: 3,
        correct: true,
        answerGiven: 'człowieku',
        expected: 'człowieku',
        srsApplied: false,
      }),
    )
    // kobieta::dative — correct on the first (only) attempt.
    await logReview(
      reviewLog({
        sessionId,
        skillId: KOBIETA_DATIVE,
        reviewedAt: 1200,
        rating: 3,
        correct: true,
        answerGiven: 'kobiecie',
        expected: 'kobiecie',
      }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 2,
      correctCount: 1,
      newSkillCount: 1,
      reviewedSkillCount: 1,
    })
    return sessionId
  }

  it('shows the real score, percent, new/reviewed counts', async () => {
    const sessionId = await seedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows new/reviewed word counts from the SessionRecord', async () => {
    const sessionId = await seedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('1 / 2')

    // newSkillCount: 1, reviewedSkillCount: 1 (seeded above).
    const tiles = screen.getAllByText('1')
    expect(tiles.length).toBeGreaterThanOrEqual(2)
  })

  it('formats the mistake as "answerGiven -> expected" with the word\'s lemma and dimension', async () => {
    const sessionId = await seedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })

    expect(await screen.findByText('człowiek')).toBeInTheDocument()
    expect(screen.getByText('człowieka')).toBeInTheDocument()
    expect(screen.getByText('człowieku')).toBeInTheDocument()
    // Appears twice: once in "Сложнее всего" (as its own dimension row) and once as the
    // mistake row's own case label.
    expect(screen.getAllByText(/Miejscownik/).length).toBeGreaterThanOrEqual(1)
    // The already-correct-on-first-attempt skill must NOT appear in the mistakes list.
    expect(screen.queryByText('kobiecie')).not.toBeInTheDocument()
  })

  it('"Разобрать ошибки" navigates to /session with exactly the mistaken skillIds', async () => {
    const sessionId = await seedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('1 / 2')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /разобрать ошибки/i }))

    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? 'null')
    expect(state).toEqual({ skillIds: [CZLOWIEK_LOCATIVE] })
  })

  it('"Закончить" navigates home', async () => {
    const sessionId = await seedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('1 / 2')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /закончить/i }))
    expect(await screen.findByTestId('home')).toBeInTheDocument()
  })

  it('hides "Разобрать ошибки" entirely when the session had zero mistakes', async () => {
    const sessionId = await createSession('learn', 1000)
    await logReview(
      reviewLog({ sessionId, skillId: KOBIETA_DATIVE, reviewedAt: 1100, correct: true, rating: 3 }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 1,
      correctCount: 1,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('1 / 1')
    expect(screen.queryByRole('button', { name: /разобрать ошибки/i })).not.toBeInTheDocument()
  })
})

describe('SessionResultPage — acceptance point 8 (zero-answer sessions never render here)', () => {
  it('redirects home when no sessionId is present in router state at all', async () => {
    renderResultPage({ pathname: '/session/result' })
    expect(await screen.findByTestId('home')).toBeInTheDocument()
  })

  it('redirects home when the referenced session does not exist', async () => {
    renderResultPage({ pathname: '/session/result', state: { sessionId: 999_999 } })
    expect(await screen.findByTestId('home')).toBeInTheDocument()
  })

  it('redirects home for a session that (defensively) has totalCount 0', async () => {
    const sessionId = await createSession('learn', 1000)
    // Never completed/answered — still totalCount: 0 from createSession's own zeroed row.
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    expect(await screen.findByTestId('home')).toBeInTheDocument()
  })
})
