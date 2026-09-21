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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { SessionResultPage } from './SessionResultPage.tsx'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { completeSession, createSession } from '@/db/repositories/sessions.repository.ts'
import { logReview } from '@/db/repositories/reviews.repository.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'

const CZLOWIEK = encodeWordId('człowiek', 'NOUN')
const KOBIETA = encodeWordId('kobieta', 'NOUN')
const CZLOWIEK_LOCATIVE = encodeSkillId(CZLOWIEK, 'noun:sg:locative')
const KOBIETA_DATIVE = encodeSkillId(KOBIETA, 'noun:sg:dative')

function reviewLog(
  overrides: Partial<ReviewLogRecord> &
    Pick<ReviewLogRecord, 'skillId' | 'reviewedAt' | 'sessionId'>,
): Omit<ReviewLogRecord, 'id'> {
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

// Задача 45 §3: верный, но нечистый первый ответ снижает процент — и итог перечисляет его.
describe('SessionResultPage — ответы с исправлением и подсказкой (задача 45)', () => {
  async function seedAssistedSession() {
    const sessionId = await createSession('learn', 1000)
    // człowiek — набор с исправленной буквой: correct, но не чистый.
    await logReview(
      reviewLog({
        sessionId,
        skillId: CZLOWIEK_LOCATIVE,
        reviewedAt: 1100,
        rating: 2, // HARD
        correct: true,
        clean: false,
        firstInSession: true,
        assist: 'corrected',
        answerGiven: 'człowieku',
        expected: 'człowieku',
      }),
    )
    // kobieta — набор с подсказкой.
    await logReview(
      reviewLog({
        sessionId,
        skillId: KOBIETA_DATIVE,
        reviewedAt: 1200,
        rating: 2,
        correct: true,
        clean: false,
        firstInSession: true,
        assist: 'hinted',
        answerGiven: 'kobiecie',
        expected: 'kobiecie',
      }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 2,
      correctCount: 0,
      newSkillCount: 0,
      reviewedSkillCount: 2,
    })
    return sessionId
  }

  it('процент падает до 0%, а ответы с исправлением и с подсказкой перечислены с пометками', async () => {
    const sessionId = await seedAssistedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })

    expect(await screen.findByText('0 / 2')).toBeInTheDocument()
    // «0%» — и общий процент, и строки «Сложнее всего» по измерениям (там тоже чистые ответы).
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(2)

    expect(screen.getByRole('heading', { name: 'Что снизило процент' })).toBeInTheDocument()
    const corrected = screen.getByText('człowiek').closest('li')!
    expect(within(corrected).getByText('с исправлением')).toBeInTheDocument()
    expect(within(corrected).getByText('człowieku')).toBeInTheDocument()
    const hinted = screen.getByText('kobieta').closest('li')!
    expect(within(hinted).getByText('с подсказкой')).toBeInTheDocument()
  })

  it('«Разобрать ошибки» за такие ответы не предлагается — это не ошибки', async () => {
    const sessionId = await seedAssistedSession()
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('0 / 2')

    expect(screen.queryByRole('button', { name: /разобрать ошибки/i })).not.toBeInTheDocument()
  })

  it('ошибка и ответ с исправлением — в одном списке; «Разобрать ошибки» ведёт только на ошибку', async () => {
    const sessionId = await createSession('learn', 1000)
    await logReview(
      reviewLog({
        sessionId,
        skillId: CZLOWIEK_LOCATIVE,
        reviewedAt: 1100,
        rating: 1,
        correct: false,
        clean: false,
        firstInSession: true,
        answerGiven: 'człowieka',
        expected: 'człowieku',
      }),
    )
    await logReview(
      reviewLog({
        sessionId,
        skillId: KOBIETA_DATIVE,
        reviewedAt: 1200,
        rating: 2,
        correct: true,
        clean: false,
        firstInSession: true,
        assist: 'corrected',
        expected: 'kobiecie',
      }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 2,
      correctCount: 0,
      newSkillCount: 0,
      reviewedSkillCount: 2,
    })
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('0 / 2')

    expect(screen.getByText('człowieka')).toBeInTheDocument()
    expect(screen.getByText('с исправлением')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /разобрать ошибки/i }))
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? 'null')
    expect(state).toEqual({ skillIds: [CZLOWIEK_LOCATIVE] })
  })

  it('старые логи без новых полей открываются без ошибок: Hard + correct — нечистый, пометка «с трудом»', async () => {
    const sessionId = await createSession('learn', 1000)
    await logReview(
      reviewLog({ sessionId, skillId: KOBIETA_DATIVE, reviewedAt: 1100, rating: 2, correct: true }),
    )
    await logReview(
      reviewLog({ sessionId, skillId: CZLOWIEK_LOCATIVE, reviewedAt: 1200, rating: 3, correct: true }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 2,
      correctCount: 2,
      newSkillCount: 0,
      reviewedSkillCount: 2,
    })
    renderResultPage({ pathname: '/session/result', state: { sessionId } })

    // Счёт пересчитывается по логам, а не берётся из SessionRecord.correctCount (2).
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('с трудом')).toBeInTheDocument()
  })

  it('без нечистых ответов блока нет, заголовок «Ошибки» остаётся только у настоящих ошибок', async () => {
    const sessionId = await createSession('learn', 1000)
    await logReview(
      reviewLog({ sessionId, skillId: KOBIETA_DATIVE, reviewedAt: 1100, rating: 4, correct: true, clean: true }),
    )
    await completeSession(sessionId, 2000, {
      totalCount: 1,
      correctCount: 1,
      newSkillCount: 0,
      reviewedSkillCount: 1,
    })
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('1 / 1')

    expect(screen.queryByRole('heading', { name: 'Что снизило процент' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ошибки' })).not.toBeInTheDocument()
  })
})

// Финальное ревью 41–45 (I2): «Показать слово» на вводе — ошибка в итогах (`correct: false`), но
// сессия «Разобрать ошибки» такой ввод не задаст (`collapseVocabStages` отбрасывает ввод с
// `awaitingRecognition`, задача 43 §2) — кнопка не должна вести в «Нечего изучать».
describe('SessionResultPage — «Показать слово» и «Разобрать ошибки» (финальное ревью 41–45, I2)', () => {
  const KOBIETA_INPUT = encodeSkillId(KOBIETA, 'vocab:ru-pl-input')

  function inputSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
    return {
      skillId: KOBIETA_INPUT,
      wordId: KOBIETA,
      kind: 'vocab',
      dimension: 'vocab:ru-pl-input',
      state: 'review',
      stability: 40,
      difficulty: 5,
      due: 1500,
      reps: 3,
      lapses: 0,
      correct: 3,
      incorrect: 0,
      createdAt: 500,
      updatedAt: 1500,
      ...overrides,
    }
  }

  /** Сессия, где слово показали кнопкой «Показать слово» (`rating: 1`, `correct: false`), и — по
   *  желанию — обычная ошибка на человеке. */
  async function seedRevealSession(withOtherMistake: boolean) {
    const sessionId = await createSession('learn', 1000)
    await logReview(
      reviewLog({
        sessionId,
        skillId: KOBIETA_INPUT,
        reviewedAt: 1100,
        rating: 1,
        correct: false,
        clean: false,
        firstInSession: true,
        answerGiven: '',
        expected: 'kobieta',
      }),
    )
    if (withOtherMistake) {
      await logReview(
        reviewLog({
          sessionId,
          skillId: CZLOWIEK_LOCATIVE,
          reviewedAt: 1200,
          rating: 1,
          correct: false,
          clean: false,
          firstInSession: true,
          answerGiven: 'człowieka',
          expected: 'człowieku',
        }),
      )
    }
    await completeSession(sessionId, 2000, {
      totalCount: withOtherMistake ? 2 : 1,
      correctCount: 0,
      newSkillCount: 0,
      reviewedSkillCount: withOtherMistake ? 2 : 1,
    })
    return sessionId
  }

  it('единственная ошибка — «Показать слово» на заблокированном вводе: слово в списке «Ошибки» есть, кнопки «Разобрать ошибки» нет', async () => {
    await upsertSkill(inputSkill({ awaitingRecognition: true, correctStreak: 0 }))
    const sessionId = await seedRevealSession(false)
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('0 / 1')

    expect(screen.getByText('kobieta', { selector: 'span.font-medium' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ошибки' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /разобрать ошибки/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /закончить/i })).toBeInTheDocument()
  })

  it('есть и другая ошибка: «Разобрать ошибки» ведёт только на незаблокированный навык', async () => {
    await upsertSkill(inputSkill({ awaitingRecognition: true, correctStreak: 0 }))
    const sessionId = await seedRevealSession(true)
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('0 / 2')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /разобрать ошибки/i }))
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? 'null')
    expect(state).toEqual({ skillIds: [CZLOWIEK_LOCATIVE] })
  })

  it('блокировка уже снята («Знаю» на этапе выбора или серия узнаваний): показанное слово снова разбирается', async () => {
    await upsertSkill(inputSkill())
    const sessionId = await seedRevealSession(false)
    renderResultPage({ pathname: '/session/result', state: { sessionId } })
    await screen.findByText('0 / 1')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /разобрать ошибки/i }))
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? 'null')
    expect(state).toEqual({ skillIds: [KOBIETA_INPUT] })
  })

  it('режим «Практика»: то же правило — кнопка «Разобрать ошибки» над «Ещё» не появляется для заблокированного ввода', async () => {
    await upsertSkill(inputSkill({ awaitingRecognition: true, correctStreak: 0 }))
    const sessionId = await seedRevealSession(false)
    renderResultPage({
      pathname: '/session/result',
      state: { sessionId, practiceExtra: { variant: 'vocab-spelling' } },
    })
    await screen.findByText('0 / 1')

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
