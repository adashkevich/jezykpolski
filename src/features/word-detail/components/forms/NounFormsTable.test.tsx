/**
 * `NounFormsTable` clickability (task 17, `spec/tasks/17-nouns-section.md` §4): every row with
 * real forms is a button that shows this word's own skill state and, on click, navigates to
 * `/session` with `{ targetSkillIds: [skillId] }` — deliberately not `{ skillIds }`, which
 * `session-scope.ts` maps to the mistakes mode this click must NOT trigger (see that file's
 * header and `session-scope.test.ts`'s own coverage of `resolveSkillScope`).
 *
 * The table was restyled to `spec/design/word-noun.png`'s single-column declension list with a
 * "Ед. число / Мн. число" segmented switch instead of two side-by-side columns — both numbers
 * are no longer in the DOM at once, so plural-only assertions click the switch first.
 *
 * Fixtures are real forms copied from the built `public/content/paradigms/**` shards (same
 * technique `WordDetailPage.test.tsx`/`content/paradigms.test.ts` already use), covering the
 * task's own acceptance list:
 *  - `kobieta|NOUN` (042.json) — the baseline 7x2 declension, already used elsewhere.
 *  - `aborcja|NOUN` (023.json) — real free-variation slot, plural genitive has two spellings
 *    ("aborcyj" / "aborcji").
 *  - `drzwi|NOUN` (021.json) — a genuine pluralia tantum: 7 forms, all plural, zero singular.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { NounFormsTable } from './NounFormsTable.tsx'

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
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
const kobietaParadigm: Paradigm = { forms: KOBIETA_RAW_FORMS.map(decodeForm), dominantGender: 'feminine' }

// `public/content/paradigms/023.json`'s `aborcja|NOUN` entry — plural genitive has two real
// spellings, "aborcyj" and "aborcji" (task 04's own canonical example of a multi-form slot).
const ABORCJA_ID = encodeWordId('aborcja', 'NOUN')
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
const aborcjaParadigm: Paradigm = { forms: ABORCJA_RAW_FORMS.map(decodeForm), dominantGender: 'feminine' }

// `public/content/paradigms/021.json`'s `drzwi|NOUN` entry, in full — a real pluralia
// tantum: every one of its 7 forms is plural (encoded `number: 2`), zero singular forms
// exist in the data at all.
const DRZWI_ID = encodeWordId('drzwi', 'NOUN')
const DRZWI_RAW_FORMS: EncodedForm[] = [
  ['drzwi', 2, 4, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiom', 2, 3, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 2, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiami', 2, 5, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiach', 2, 6, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 1, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 7, 5, 0, 0, 0, 0, 0, 0],
]
const drzwiParadigm: Paradigm = { forms: DRZWI_RAW_FORMS.map(decodeForm), dominantGender: 'neuter' }

/** Surfaces `location.state`, mirroring `WordDetailPage.test.tsx`'s own probe. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
}

/** Surfaces the matched `:wordId` param for the "Тренировать таблицей" route (task 18). */
function TablePracticeProbe() {
  const { wordId } = useParams<{ wordId: string }>()
  return <pre data-testid="table-practice-word-id">{wordId}</pre>
}

function renderTable(
  wordId: string,
  paradigm: Paradigm,
  skills: readonly SkillRecord[] | undefined = undefined,
) {
  return render(
    <MemoryRouter initialEntries={['/word']}>
      <Routes>
        <Route
          path="/word"
          element={<NounFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />}
        />
        <Route path="/session" element={<SessionStateProbe />} />
        <Route path="/practice/table/:wordId" element={<TablePracticeProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('kobieta — clickable rows (defaults to "Ед. число"), no state caption until mastered, correct skillId on navigation', () => {
  it('a row with a real form is a button, with no state caption when no SkillRecord exists yet', () => {
    renderTable(KOBIETA_ID, kobietaParadigm)
    const button = screen.getByRole('button', { name: /^Narzędnik.*liczba pojedyncza.*kobietą\. Тренировать\.$/i })
    expect(button).toBeInTheDocument()
  })

  it('clicking a row navigates to /session with exactly that one skillId under targetSkillIds', async () => {
    const user = userEvent.setup()
    renderTable(KOBIETA_ID, kobietaParadigm)

    await user.click(screen.getByRole('button', { name: /Narzędnik.*liczba pojedyncza/i }))

    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
      skillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([encodeSkillId(KOBIETA_ID, 'noun:sg:instrumental')])
    // Never the mistake-scope key — that would force `mode: 'mistakes'` and suppress SRS.
    expect(state.skillIds).toBeUndefined()
  })

  it('Wołacz (vocative) stays visible and clickable — task §6: excluded from default training, not from the table', () => {
    renderTable(KOBIETA_ID, kobietaParadigm)
    expect(screen.getByText('Wołacz')).toBeInTheDocument()
    // Singular vocative form is "kobieto" — its row is a real button, not disabled/greyed text.
    expect(screen.getByRole('button', { name: /Wołacz.*liczba pojedyncza/i })).toBeInTheDocument()
  })

  it('a partially-materialized (not yet mastered) skill still shows no state caption', () => {
    const skill: SkillRecord = {
      skillId: encodeSkillId(KOBIETA_ID, 'noun:sg:instrumental'),
      wordId: KOBIETA_ID,
      kind: 'noun',
      dimension: 'noun:sg:instrumental',
      state: 'review',
      stability: 30, // TARGET_STABILITY_DAYS is 60 -> 50%, below MASTERED_THRESHOLD (0.9)
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    }
    renderTable(KOBIETA_ID, kobietaParadigm, [skill])
    expect(
      screen.getByRole('button', { name: /^Narzędnik.*liczba pojedyncza.*kobietą\. Тренировать\.$/i }),
    ).toBeInTheDocument()
  })

  it('a mastered skill shows a "✓" caption', () => {
    const skill: SkillRecord = {
      skillId: encodeSkillId(KOBIETA_ID, 'noun:sg:instrumental'),
      wordId: KOBIETA_ID,
      kind: 'noun',
      dimension: 'noun:sg:instrumental',
      state: 'review',
      stability: 60, // TARGET_STABILITY_DAYS is 60 -> 100%, above MASTERED_THRESHOLD (0.9)
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    }
    renderTable(KOBIETA_ID, kobietaParadigm, [skill])
    expect(screen.getByRole('button', { name: /Narzędnik.*✓/i })).toBeInTheDocument()
  })
})

describe('aborcja — a slot with two real spellings shows both, and is clickable as ONE skill', () => {
  it('the plural genitive row shows "aborcyj / aborcji" and clicking it sends one skillId', async () => {
    const user = userEvent.setup()
    renderTable(ABORCJA_ID, aborcjaParadigm)

    await user.click(screen.getByRole('button', { name: 'Мн. число' }))

    const row = screen.getByRole('button', {
      name: /Dopełniacz.*liczba mnoga.*aborcyj \/ aborcji/i,
    })
    expect(row).toBeInTheDocument()

    await user.click(row)
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([encodeSkillId(ABORCJA_ID, 'noun:pl:genitive')])
  })
})

describe('drzwi — pluralia tantum: defaults to "Мн. число", singular has no forms at all', () => {
  it('defaults to the plural tab and every row is a real button — 7 cases, all clickable', () => {
    renderTable(DRZWI_ID, drzwiParadigm)
    expect(screen.getByRole('button', { name: 'Мн. число' })).toHaveAttribute('aria-pressed', 'true')

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      expect(row.querySelector('button')).not.toBeNull()
    }
  })

  it('switching to "Ед. число" shows every case as an empty dash, never a button', async () => {
    const user = userEvent.setup()
    renderTable(DRZWI_ID, drzwiParadigm)

    await user.click(screen.getByRole('button', { name: 'Ед. число' }))

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    for (const row of rows) {
      expect(row.textContent).toContain('—')
      expect(row.querySelector('button')).toBeNull()
    }
  })
})

describe('form wrapping (acceptance: no page-level horizontal scroll at 320px)', () => {
  it('a long form wraps instead of forcing overflow', () => {
    renderTable(KOBIETA_ID, kobietaParadigm)
    const button = screen.getByRole('button', { name: /Narzędnik.*liczba pojedyncza/i })
    const formSpan = button.querySelector('.break-words')
    expect(formSpan).not.toBeNull()
  })
})

describe('"Тренировать таблицей" button (task 18, FR-62)', () => {
  it('navigates to /practice/table/:wordId — a separate route from the per-row Learn scope', async () => {
    const user = userEvent.setup()
    renderTable(KOBIETA_ID, kobietaParadigm)

    await user.click(screen.getByRole('button', { name: 'Тренировать таблицей' }))

    // React Router decodes the param automatically — the raw URL segment was the
    // %-encoded form, matching `useParams` matches `parseWordParam`'s own expectation.
    expect(screen.getByTestId('table-practice-word-id').textContent).toBe(KOBIETA_ID)
    // Never /session — a row click uses that route (targetSkillIds), this button doesn't.
    expect(screen.queryByTestId('session-state')).not.toBeInTheDocument()
  })
})
