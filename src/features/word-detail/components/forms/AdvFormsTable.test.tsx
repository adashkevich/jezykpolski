/**
 * `AdvFormsTable` — degrees of comparison only (FR-05), rendered through the same
 * `DegreeComparisonBlock` `AdjFormsTable` uses (`spec/tasks/22-adjectives-section.md` step 4,
 * acceptance "Наречия используют тот же компонент степеней сравнения").
 *
 * Fixtures are real, unmodified `forms` arrays from `public/content/paradigms/000.json`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import { AdvFormsTable } from './AdvFormsTable.tsx'

const DYSKRETNIE_ID = encodeWordId('dyskretnie', 'ADV')
const NIEJEDNOKROTNIE_ID = encodeWordId('niejednokrotnie', 'ADV')
const POWOLI_ID = encodeWordId('powoli', 'ADV')

// `dyskretnie|ADV` — all three degrees present.
const DYSKRETNIE_RAW_FORMS: EncodedForm[] = [
  ['najdyskretniej', 0, 0, 0, 3, 0, 0, 0, 0, 0],
  ['dyskretnie', 0, 0, 0, 1, 0, 0, 0, 0, 0],
  ['dyskretniej', 0, 0, 0, 2, 0, 0, 0, 0, 0],
]
const dyskretnieParadigm: Paradigm = { forms: DYSKRETNIE_RAW_FORMS.map(decodeForm) }

// `niejednokrotnie|ADV` — only the positive degree exists in the data.
const NIEJEDNOKROTNIE_RAW_FORMS: EncodedForm[] = [
  ['niejednokrotnie', 0, 0, 0, 1, 0, 0, 0, 0, 0],
]
const niejednokrotnieParadigm: Paradigm = { forms: NIEJEDNOKROTNIE_RAW_FORMS.map(decodeForm) }

// `powoli|ADV` — its one form carries no `degree` at all (code 0 -> undefined).
const POWOLI_RAW_FORMS: EncodedForm[] = [['powoli', 0, 0, 0, 0, 0, 0, 0, 0, 0]]
const powoliParadigm: Paradigm = { forms: POWOLI_RAW_FORMS.map(decodeForm) }

/** Surfaces `location.state`, mirroring `NounFormsTable.test.tsx`'s own probe. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
}

function renderTable(wordId: string, paradigm: Paradigm) {
  return render(
    <MemoryRouter initialEntries={['/word']}>
      <Routes>
        <Route path="/word" element={<AdvFormsTable wordId={wordId} paradigm={paradigm} skills={undefined} />} />
        <Route path="/session" element={<SessionStateProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('dyskretnie — all three degrees render via the shared DegreeComparisonBlock', () => {
  it('shows the same "Степени сравнения" heading and row shape AdjFormsTable uses', () => {
    renderTable(DYSKRETNIE_ID, dyskretnieParadigm)
    expect(screen.getByText('Степени сравнения')).toBeInTheDocument()
    expect(screen.getByText('Stopień równy:')).toBeInTheDocument()
    expect(screen.getByText('dyskretnie')).toBeInTheDocument()
    expect(screen.getByText('Stopień wyższy:')).toBeInTheDocument()
    expect(screen.getByText('dyskretniej')).toBeInTheDocument()
    expect(screen.getByText('Stopień najwyższy:')).toBeInTheDocument()
    expect(screen.getByText('najdyskretniej')).toBeInTheDocument()
  })

  it('comparative/superlative rows are clickable buttons (enumerateSkills makes adv:degree:comparative/superlative); positive is not (no such skill)', async () => {
    const user = userEvent.setup()
    renderTable(DYSKRETNIE_ID, dyskretnieParadigm)

    // Positive: plain text, no button — `enumerateSkills`'s ADV branch never produces
    // `adv:degree:positive` (an adverb's own base form isn't a recall-worthy skill).
    expect(screen.queryByRole('button', { name: /Stopień równy/i })).not.toBeInTheDocument()

    const comparativeButton = screen.getByRole('button', { name: /Stopień wyższy.*dyskretniej/i })
    await user.click(comparativeButton)
    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([
      encodeSkillId(DYSKRETNIE_ID, 'adv:degree:comparative'),
    ])
  })
})

describe('niejednokrotnie — only the positive degree exists, no comparative/superlative rows', () => {
  it('shows exactly one row, as plain text (no skill to train)', () => {
    renderTable(NIEJEDNOKROTNIE_ID, niejednokrotnieParadigm)
    expect(screen.getByText('Stopień równy:')).toBeInTheDocument()
    expect(screen.queryByText('Stopień wyższy:')).not.toBeInTheDocument()
    expect(screen.queryByText('Stopień najwyższy:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('powoli — no degree forms at all', () => {
  it('shows the "no comparison forms" message instead of an empty block', () => {
    renderTable(POWOLI_ID, powoliParadigm)
    expect(screen.getByText('Для этого наречия нет форм сравнения.')).toBeInTheDocument()
    expect(screen.queryByText('Степени сравнения')).not.toBeInTheDocument()
  })
})
