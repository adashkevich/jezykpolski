/**
 * `TableExercise` component tests (`spec/tasks/18-noun-exercises.md` step 4, FR-62,
 * acceptance points 4/5/6/9). A real (fake-indexeddb) database is needed — this component
 * calls `ensureSkill`/`submitAnswer` directly on cell blur, same convention
 * `answer-pipeline.test.ts` already uses for `submitAnswer` itself.
 *
 * `submitAnswer` -> `applyAnswer` -> `computeWordProgress` -> `getParadigm` needs the word's
 * paradigm shard resolvable, so `fetch` is stubbed for `paradigms/000.json` with the same
 * `kobieta|NOUN` forms `NounFormsTable.test.tsx`/`generate-table.test.ts` already use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { getSkill } from '@/db/repositories/skills.repository.ts'
import { createSession } from '@/db/repositories/sessions.repository.ts'
import { getLogsForSession } from '@/db/repositories/reviews.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import type { EncodedForm } from '@/content/codec.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { TableExercise } from './TableExercise.tsx'
import type { TableExerciseData } from '../hooks/useTablePracticeSession.ts'

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const KOBIETA_ENTRY: WordIndexEntry = {
  lemma: 'kobieta',
  pos: 'NOUN',
  rank: 3,
  level: 'A1',
  primaryRu: 'женщина',
  sensesShard: 0,
  paradigmShard: 0,
}
const KOBIETA_RAW_FORMS: EncodedForm[] = [
  ['kobiety', 2, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobietom', 2, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiet', 2, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietami', 2, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobietach', 2, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 2, 7, 1, 0, 0, 0, 0, 0, 0],
  ['kobietę', 1, 4, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 3, 1, 0, 0, 0, 0, 0, 0],
  ['kobiety', 1, 2, 1, 0, 0, 0, 0, 0, 0],
  ['kobietą', 1, 5, 1, 0, 0, 0, 0, 0, 0],
  ['kobiecie', 1, 6, 1, 0, 0, 0, 0, 0, 0],
  ['kobieta', 1, 1, 1, 0, 0, 0, 0, 0, 0],
  ['kobieto', 1, 7, 1, 0, 0, 0, 0, 0, 0],
]

const ABORCJA_ID = encodeWordId('aborcja', 'NOUN')
const ABORCJA_ENTRY: WordIndexEntry = {
  lemma: 'aborcja',
  pos: 'NOUN',
  rank: 4,
  level: 'B1',
  primaryRu: 'аборт',
  sensesShard: 0,
  paradigmShard: 1,
}
const ABORCJA_RAW_FORMS: EncodedForm[] = [
  ['aborcje', 2, 4, 1, 0, 0, 0, 0, 0, 0],
  ['aborcjom', 2, 3, 1, 0, 0, 0, 0, 0, 0],
  ['aborcyj', 2, 2, 1, 0, 0, 0, 0, 0, 0],
  ['aborcji', 2, 2, 1, 0, 0, 0, 0, 0, 0],
  ['aborcjami', 2, 5, 1, 0, 0, 0, 0, 0, 0],
  ['aborcjach', 2, 6, 1, 0, 0, 0, 0, 0, 0],
  ['aborcje', 2, 1, 1, 0, 0, 0, 0, 0, 0],
  ['aborcje', 2, 7, 1, 0, 0, 0, 0, 0, 0],
  ['aborcję', 1, 4, 1, 0, 0, 0, 0, 0, 0],
  ['aborcji', 1, 3, 1, 0, 0, 0, 0, 0, 0],
  ['aborcji', 1, 2, 1, 0, 0, 0, 0, 0, 0],
  ['aborcją', 1, 5, 1, 0, 0, 0, 0, 0, 0],
  ['aborcji', 1, 6, 1, 0, 0, 0, 0, 0, 0],
  ['aborcja', 1, 1, 1, 0, 0, 0, 0, 0, 0],
  ['aborcjo', 1, 7, 1, 0, 0, 0, 0, 0, 0],
]

function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

/** Builds the same `cells` shape `generate.ts#generateTableExercise` would, from a
 *  hand-picked subset — a full 14-cell exercise plus a helper to grab one editable cell. */
function kobietaTableExercise(): TableExerciseData {
  return {
    type: 'table',
    lemma: 'kobieta',
    cells: [
      { slot: 'noun:sg:nominative', prefilled: true, accepted: ['kobieta'] },
      { slot: 'noun:pl:nominative', prefilled: true, accepted: ['kobiety'] },
      { slot: 'noun:sg:genitive', prefilled: false, accepted: ['kobiety'] },
      { slot: 'noun:pl:genitive', prefilled: false, accepted: ['kobiet'] },
      { slot: 'noun:sg:dative', prefilled: false, accepted: ['kobiecie'] },
      { slot: 'noun:pl:dative', prefilled: false, accepted: ['kobietom'] },
      { slot: 'noun:sg:accusative', prefilled: false, accepted: ['kobietę'] },
      { slot: 'noun:pl:accusative', prefilled: false, accepted: ['kobiety'] },
      { slot: 'noun:sg:instrumental', prefilled: false, accepted: ['kobietą'] },
      { slot: 'noun:pl:instrumental', prefilled: false, accepted: ['kobietami'] },
      { slot: 'noun:sg:locative', prefilled: false, accepted: ['kobiecie'] },
      { slot: 'noun:pl:locative', prefilled: false, accepted: ['kobietach'] },
      { slot: 'noun:sg:vocative', prefilled: false, accepted: ['kobieto'] },
      { slot: 'noun:pl:vocative', prefilled: false, accepted: ['kobiety'] },
    ],
  }
}

function aborcjaTableExercise(): TableExerciseData {
  return {
    type: 'table',
    lemma: 'aborcja',
    cells: [
      { slot: 'noun:sg:nominative', prefilled: true, accepted: ['aborcja'] },
      { slot: 'noun:pl:nominative', prefilled: true, accepted: ['aborcje'] },
      { slot: 'noun:sg:genitive', prefilled: false, accepted: ['aborcji'] },
      { slot: 'noun:pl:genitive', prefilled: false, accepted: ['aborcyj', 'aborcji'] },
      { slot: 'noun:sg:dative', prefilled: false, accepted: [] },
      { slot: 'noun:pl:dative', prefilled: false, accepted: [] },
      { slot: 'noun:sg:accusative', prefilled: false, accepted: [] },
      { slot: 'noun:pl:accusative', prefilled: false, accepted: [] },
      { slot: 'noun:sg:instrumental', prefilled: false, accepted: [] },
      { slot: 'noun:pl:instrumental', prefilled: false, accepted: [] },
      { slot: 'noun:sg:locative', prefilled: false, accepted: [] },
      { slot: 'noun:pl:locative', prefilled: false, accepted: [] },
      { slot: 'noun:sg:vocative', prefilled: false, accepted: [] },
      { slot: 'noun:pl:vocative', prefilled: false, accepted: [] },
    ],
  }
}

beforeEach(async () => {
  await openDatabase()
  __resetLoaderCachesForTest()
  __resetIndexStoreForTest()
  initIndexStore([KOBIETA_ENTRY, ABORCJA_ENTRY])
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await deleteDatabase()
  __resetIndexStoreForTest()
})

describe('TableExercise — Mianownik row is pre-filled, not editable, not graded', () => {
  it('renders both nominative cells as plain text, with no <input>', () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    const onCellGraded = vi.fn()
    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={1}
        exercise={kobietaTableExercise()}
        onCellGraded={onCellGraded}
        onDone={() => {}}
      />,
    )
    // "kobieta" appears twice (the h2 header lemma, and the sg nominative cell); "kobiety"
    // appears once (the pl nominative cell) plus possibly among other cells' placeholder
    // text — neither ever appears inside an <input>.
    for (const value of ['kobieta', 'kobiety']) {
      const nodes = screen.getAllByText(value)
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        expect(node.closest('input')).toBeNull()
      }
    }
    expect(document.querySelectorAll('input')).toHaveLength(12) // 14 cells - 2 prefilled
  })
})

describe('TableExercise — grading a cell (acceptance: kobiety for sg.gen kobieta)', () => {
  it('grades correct on blur, updates the skill (practice mode), and reports the result', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        'senses/000.json': {},
        'paradigms/000.json': { [KOBIETA_ID]: { forms: KOBIETA_RAW_FORMS } },
      }),
    )
    const onCellGraded = vi.fn()
    const user = userEvent.setup()
    const sessionId = await createSession('practice', Date.now())

    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={sessionId}
        exercise={kobietaTableExercise()}
        onCellGraded={onCellGraded}
        onDone={() => {}}
      />,
    )

    const genitiveInput = screen.getByRole('textbox', { name: /Dopełniacz.*liczba pojedyncza/i })
    await user.type(genitiveInput, 'kobiety')
    await user.tab() // blur -> grade

    await waitFor(() => expect(onCellGraded).toHaveBeenCalledExactlyOnceWith({
      correct: true,
      isNewSkill: true,
    }))

    const skillId = encodeSkillId(KOBIETA_ID, 'noun:sg:genitive')
    const skill = await getSkill(skillId)
    expect(skill).toBeDefined()
    expect(skill!.reps).toBe(1)
    expect(skill!.correct).toBe(1)
    expect(skill!.incorrect).toBe(0)
    expect(skill!.state).not.toBe('new')

    const logs = await getLogsForSession(sessionId)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.skillId).toBe(skillId)
    expect(logs[0]!.correct).toBe(true)
    // Practice-mode cap (policy.ts rule 2): a correct free-text answer would normally rate
    // Easy (4), but Practice mode caps it at Good (3).
    expect(logs[0]!.rating).toBeLessThanOrEqual(3)
  })

  it('grades a diacritic-free answer as nearMiss, not correct', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        'senses/000.json': {},
        'paradigms/000.json': { [KOBIETA_ID]: { forms: KOBIETA_RAW_FORMS } },
      }),
    )
    const onCellGraded = vi.fn()
    const user = userEvent.setup()
    const sessionId = await createSession('practice', Date.now())

    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={sessionId}
        exercise={kobietaTableExercise()}
        onCellGraded={onCellGraded}
        onDone={() => {}}
      />,
    )

    const instrumentalInput = screen.getByRole('textbox', { name: /Narzędnik.*liczba pojedyncza/i })
    await user.type(instrumentalInput, 'kobieta')
    await user.tab()

    await waitFor(() =>
      expect(onCellGraded).toHaveBeenCalledExactlyOnceWith({ correct: false, isNewSkill: true }),
    )
  })

  it('the acceptance-corrected example: "aborcyj" for the PLURAL genitive of aborcja is accepted', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchMock({
        'senses/000.json': {},
        'paradigms/001.json': { [ABORCJA_ID]: { forms: ABORCJA_RAW_FORMS } },
      }),
    )
    const onCellGraded = vi.fn()
    const user = userEvent.setup()
    const sessionId = await createSession('practice', Date.now())

    render(
      <TableExercise
        wordId={ABORCJA_ID}
        sessionId={sessionId}
        exercise={aborcjaTableExercise()}
        onCellGraded={onCellGraded}
        onDone={() => {}}
      />,
    )

    const plGenitiveInput = screen.getByRole('textbox', { name: /Dopełniacz.*liczba mnoga/i })
    await user.type(plGenitiveInput, 'aborcyj')
    await user.tab()

    await waitFor(() =>
      expect(onCellGraded).toHaveBeenCalledExactlyOnceWith({ correct: true, isNewSkill: true }),
    )
  })

  it('a cell with no accepted forms at all (incomplete paradigm) is a plain "—", not an input', () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    render(
      <TableExercise
        wordId={ABORCJA_ID}
        sessionId={1}
        exercise={aborcjaTableExercise()}
        onCellGraded={() => {}}
        onDone={() => {}}
      />,
    )
    // sg dative has an empty `accepted` list in this fixture.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})

describe('TableExercise — usable at 320px (acceptance: scroll, Tab order)', () => {
  it('the table sits inside an overflow-x-auto wrapper with a min-width', () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={1}
        exercise={kobietaTableExercise()}
        onCellGraded={() => {}}
        onDone={() => {}}
      />,
    )
    const table = screen.getByRole('table')
    expect(table.className).toContain('min-w-')
    expect(table.parentElement?.className).toContain('overflow-x-auto')
  })

  it('Tab moves focus from one editable cell to the next, in DOM order', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    const user = userEvent.setup()
    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={1}
        exercise={kobietaTableExercise()}
        onCellGraded={() => {}}
        onDone={() => {}}
      />,
    )
    const inputs = screen.getAllByRole('textbox')
    inputs[0]!.focus()
    expect(inputs[0]).toHaveFocus()
    await user.tab()
    expect(inputs[1]).toHaveFocus()
  })

  it('every open cell input is a ≥44px touch target (NFR-11)', () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={1}
        exercise={kobietaTableExercise()}
        onCellGraded={() => {}}
        onDone={() => {}}
      />,
    )
    for (const input of screen.getAllByRole('textbox')) {
      expect(input.className).toMatch(/\bh-11\b/)
    }
  })
})

describe('TableExercise — "Готово" button', () => {
  it('calls onDone when clicked', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ 'senses/000.json': {} }))
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <TableExercise
        wordId={KOBIETA_ID}
        sessionId={1}
        exercise={kobietaTableExercise()}
        onCellGraded={() => {}}
        onDone={onDone}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onDone).toHaveBeenCalledOnce()
  })
})
