/**
 * `AdjFormsTable` — case x gender grid with gender-cell merge, degree block
 * (`spec/tasks/22-adjectives-section.md`, FR-45/FR-68/FR-69).
 *
 * Fixtures are the real, unmodified `forms` arrays from `public/content/paradigms/013.json`
 * (`absolutny|ADJ`) and `public/content/paradigms/006.json` (`dobry|ADJ`) — the two words the
 * task text itself uses as its running examples (§"Пример из данных", §"Степени сравнения").
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { Paradigm } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { AdjFormsTable } from './AdjFormsTable.tsx'

const ABSOLUTNY_ID = encodeWordId('absolutny', 'ADJ')
const DOBRY_ID = encodeWordId('dobry', 'ADJ')

/** Surfaces `location.state`, mirroring `NounFormsTable.test.tsx`'s own probe. */
function SessionStateProbe() {
  const location = useLocation()
  return <pre data-testid="session-state">{JSON.stringify(location.state)}</pre>
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
          element={<AdjFormsTable wordId={wordId} paradigm={paradigm} skills={skills} />}
        />
        <Route path="/session" element={<SessionStateProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

// `public/content/paradigms/013.json`'s `absolutny|ADJ` entry, in full (28 forms) — task
// text's own worked example for the ADJ gender-aggregate breakdown.
const ABSOLUTNY_RAW_FORMS: EncodedForm[] = [
  ['absolutnych', 2, 4, 2, 1, 0, 0, 0, 0, 0],
  ['absolutne', 2, 4, 6, 1, 0, 0, 0, 0, 0],
  ['absolutnym', 2, 3, 7, 1, 0, 0, 0, 0, 0],
  ['absolutnych', 2, 2, 7, 1, 0, 0, 0, 0, 0],
  ['absolutnymi', 2, 5, 7, 1, 0, 0, 0, 0, 0],
  ['absolutnych', 2, 6, 7, 1, 0, 0, 0, 0, 0],
  ['absolutni', 2, 1, 2, 1, 0, 0, 0, 0, 0],
  ['absolutne', 2, 1, 6, 1, 0, 0, 0, 0, 0],
  ['absolutni', 2, 7, 2, 1, 0, 0, 0, 0, 0],
  ['absolutne', 2, 7, 6, 1, 0, 0, 0, 0, 0],
  ['absolutnego', 1, 4, 8, 1, 0, 0, 0, 0, 0],
  ['absolutną', 1, 4, 1, 1, 0, 0, 0, 0, 0],
  ['absolutny', 1, 4, 3, 1, 0, 0, 0, 0, 0],
  ['absolutne', 1, 4, 5, 1, 0, 0, 0, 0, 0],
  ['absolutnej', 1, 3, 1, 1, 0, 0, 0, 0, 0],
  ['absolutnemu', 1, 3, 9, 1, 0, 0, 0, 0, 0],
  ['absolutnej', 1, 2, 1, 1, 0, 0, 0, 0, 0],
  ['absolutnego', 1, 2, 9, 1, 0, 0, 0, 0, 0],
  ['absolutną', 1, 5, 1, 1, 0, 0, 0, 0, 0],
  ['absolutnym', 1, 5, 9, 1, 0, 0, 0, 0, 0],
  ['absolutnym', 1, 6, 9, 1, 0, 0, 0, 0, 0],
  ['absolutnej', 1, 6, 1, 1, 0, 0, 0, 0, 0],
  ['absolutny', 1, 1, 10, 1, 0, 0, 0, 0, 0],
  ['absolutna', 1, 1, 1, 1, 0, 0, 0, 0, 0],
  ['absolutne', 1, 1, 5, 1, 0, 0, 0, 0, 0],
  ['absolutna', 1, 7, 1, 1, 0, 0, 0, 0, 0],
  ['absolutny', 1, 7, 10, 1, 0, 0, 0, 0, 0],
  ['absolutne', 1, 7, 5, 1, 0, 0, 0, 0, 0],
]
const absolutnyParadigm: Paradigm = { forms: ABSOLUTNY_RAW_FORMS.map(decodeForm) }

// `public/content/paradigms/006.json`'s `dobry|ADJ` entry, in full (84 forms, includes
// comparative/superlative degree forms) — the task's own irregular-comparison example.
const DOBRY_RAW_FORMS: EncodedForm[] = [
  ['dobre', 2, 4, 6, 1, 0, 0, 0, 0, 0],
  ['lepszych', 2, 4, 2, 2, 0, 0, 0, 0, 0],
  ['lepsze', 2, 4, 6, 2, 0, 0, 0, 0, 0],
  ['dobrych', 2, 4, 2, 1, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 4, 6, 3, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 4, 2, 3, 0, 0, 0, 0, 0],
  ['dobrym', 2, 3, 7, 1, 0, 0, 0, 0, 0],
  ['lepszym', 2, 3, 7, 2, 0, 0, 0, 0, 0],
  ['najlepszym', 2, 3, 7, 3, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 2, 7, 3, 0, 0, 0, 0, 0],
  ['lepszych', 2, 2, 7, 2, 0, 0, 0, 0, 0],
  ['dobrych', 2, 2, 7, 1, 0, 0, 0, 0, 0],
  ['lepszymi', 2, 5, 7, 2, 0, 0, 0, 0, 0],
  ['dobrymi', 2, 5, 7, 1, 0, 0, 0, 0, 0],
  ['najlepszymi', 2, 5, 7, 3, 0, 0, 0, 0, 0],
  ['lepszych', 2, 6, 7, 2, 0, 0, 0, 0, 0],
  ['najlepszych', 2, 6, 7, 3, 0, 0, 0, 0, 0],
  ['dobrych', 2, 6, 7, 1, 0, 0, 0, 0, 0],
  ['dobre', 2, 1, 6, 1, 0, 0, 0, 0, 0],
  ['najlepsi', 2, 1, 2, 3, 0, 0, 0, 0, 0],
  ['lepsi', 2, 1, 2, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 1, 6, 3, 0, 0, 0, 0, 0],
  ['lepsze', 2, 1, 6, 2, 0, 0, 0, 0, 0],
  ['dobrzy', 2, 1, 2, 1, 0, 0, 0, 0, 0],
  ['lepsze', 2, 7, 6, 2, 0, 0, 0, 0, 0],
  ['dobre', 2, 7, 6, 1, 0, 0, 0, 0, 0],
  ['dobrzy', 2, 7, 2, 1, 0, 0, 0, 0, 0],
  ['najlepsi', 2, 7, 2, 3, 0, 0, 0, 0, 0],
  ['najlepsze', 2, 7, 6, 3, 0, 0, 0, 0, 0],
  ['lepsi', 2, 7, 2, 2, 0, 0, 0, 0, 0],
  ['dobrego', 1, 4, 8, 1, 0, 0, 0, 0, 0],
  ['dobrą', 1, 4, 1, 1, 0, 0, 0, 0, 0],
  ['lepsze', 1, 4, 5, 2, 0, 0, 0, 0, 0],
  ['dobry', 1, 4, 3, 1, 0, 0, 0, 0, 0],
  ['lepszą', 1, 4, 1, 2, 0, 0, 0, 0, 0],
  ['lepszy', 1, 4, 3, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 4, 5, 3, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 4, 3, 3, 0, 0, 0, 0, 0],
  ['najlepszego', 1, 4, 8, 3, 0, 0, 0, 0, 0],
  ['najlepszą', 1, 4, 1, 3, 0, 0, 0, 0, 0],
  ['lepszego', 1, 4, 8, 2, 0, 0, 0, 0, 0],
  ['dobre', 1, 4, 5, 1, 0, 0, 0, 0, 0],
  ['lepszemu', 1, 3, 9, 2, 0, 0, 0, 0, 0],
  ['dobrej', 1, 3, 1, 1, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 3, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszemu', 1, 3, 9, 3, 0, 0, 0, 0, 0],
  ['lepszej', 1, 3, 1, 2, 0, 0, 0, 0, 0],
  ['dobremu', 1, 3, 9, 1, 0, 0, 0, 0, 0],
  ['dobrej', 1, 2, 1, 1, 0, 0, 0, 0, 0],
  ['lepszej', 1, 2, 1, 2, 0, 0, 0, 0, 0],
  ['lepszego', 1, 2, 9, 2, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 2, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszego', 1, 2, 9, 3, 0, 0, 0, 0, 0],
  ['dobrego', 1, 2, 9, 1, 0, 0, 0, 0, 0],
  ['dobrym', 1, 5, 9, 1, 0, 0, 0, 0, 0],
  ['lepszą', 1, 5, 1, 2, 0, 0, 0, 0, 0],
  ['lepszym', 1, 5, 9, 2, 0, 0, 0, 0, 0],
  ['dobrą', 1, 5, 1, 1, 0, 0, 0, 0, 0],
  ['najlepszą', 1, 5, 1, 3, 0, 0, 0, 0, 0],
  ['najlepszym', 1, 5, 9, 3, 0, 0, 0, 0, 0],
  ['dobrej', 1, 6, 1, 1, 0, 0, 0, 0, 0],
  ['dobrym', 1, 6, 9, 1, 0, 0, 0, 0, 0],
  ['lepszej', 1, 6, 1, 2, 0, 0, 0, 0, 0],
  ['lepszym', 1, 6, 9, 2, 0, 0, 0, 0, 0],
  ['najlepszym', 1, 6, 9, 3, 0, 0, 0, 0, 0],
  ['najlepszej', 1, 6, 1, 3, 0, 0, 0, 0, 0],
  ['dobre', 1, 1, 5, 1, 0, 0, 0, 0, 0],
  ['dobra', 1, 1, 1, 1, 0, 0, 0, 0, 0],
  ['lepsza', 1, 1, 1, 2, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 1, 5, 3, 0, 0, 0, 0, 0],
  ['lepszy', 1, 1, 10, 2, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 1, 10, 3, 0, 0, 0, 0, 0],
  ['lepsze', 1, 1, 5, 2, 0, 0, 0, 0, 0],
  ['najlepsza', 1, 1, 1, 3, 0, 0, 0, 0, 0],
  ['dobry', 1, 1, 10, 1, 0, 0, 0, 0, 0],
  ['dobry', 1, 7, 10, 1, 0, 0, 0, 0, 0],
  ['lepszy', 1, 7, 10, 2, 0, 0, 0, 0, 0],
  ['dobra', 1, 7, 1, 1, 0, 0, 0, 0, 0],
  ['lepsza', 1, 7, 1, 2, 0, 0, 0, 0, 0],
  ['najlepszy', 1, 7, 10, 3, 0, 0, 0, 0, 0],
  ['lepsze', 1, 7, 5, 2, 0, 0, 0, 0, 0],
  ['najlepsza', 1, 7, 1, 3, 0, 0, 0, 0, 0],
  ['najlepsze', 1, 7, 5, 3, 0, 0, 0, 0, 0],
  ['dobre', 1, 7, 5, 1, 0, 0, 0, 0, 0],
]
const dobryParadigm: Paradigm = { forms: DOBRY_RAW_FORMS.map(decodeForm) }

afterEach(() => cleanup())

describe('absolutny — plural: "any"/"non_masculine_personal" aggregates leave no false-empty cells', () => {
  it('switches to plural and shows no dash in the case x gender grid at all', async () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Мн. число' }))

    const table = screen.getByRole('table')
    const bodyCells = table.querySelectorAll('tbody td')
    for (const cell of bodyCells) {
      expect(cell.textContent).not.toBe('—')
    }
  })

  it('genitive/dative/instrumental/locative plural collapse into ONE cell spanning all 5 gender columns ("any")', async () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Мн. число' }))

    const table = screen.getByRole('table')
    const genitiveRow = screen.getByText('Dopełniacz').closest('tr')!
    const cells = genitiveRow.querySelectorAll('td')
    expect(cells).toHaveLength(1)
    expect(cells[0]!.getAttribute('colSpan')).toBe('5')
    expect(cells[0]!.textContent).toBe('absolutnych')
    void table
  })

  it('nominative/vocative plural split into masculine_personal (1 col) vs the rest (4 cols merged)', async () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Мн. число' }))

    const nomRow = screen.getByText('Mianownik').closest('tr')!
    const cells = nomRow.querySelectorAll('td')
    expect(cells).toHaveLength(2)
    expect(cells[0]!.getAttribute('colSpan')).toBe('1')
    expect(cells[0]!.textContent).toBe('absolutni')
    expect(cells[1]!.getAttribute('colSpan')).toBe('4')
    expect(cells[1]!.textContent).toBe('absolutne')
  })
})

describe('absolutny — singular accusative masculine: animacy distinction is visible, not merged away', () => {
  it('masculine_personal + masculine_animate merge (both "absolutnego"), masculine_inanimate stays separate ("absolutny")', () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    // Default view is already singular.
    const accRow = screen.getByText('Biernik').closest('tr')!
    const cells = accRow.querySelectorAll('td')
    // masculine_personal+animate merged (2), masculine_inanimate (1), feminine (1), neuter (1)
    expect(cells).toHaveLength(4)
    expect(cells[0]!.getAttribute('colSpan')).toBe('2')
    expect(cells[0]!.textContent).toBe('absolutnego')
    expect(cells[1]!.getAttribute('colSpan')).toBe('1')
    expect(cells[1]!.textContent).toBe('absolutny')
    expect(cells[2]!.textContent).toBe('absolutną')
    expect(cells[3]!.textContent).toBe('absolutne')
  })

  it('singular nominative merges all 3 masculine subtypes into one cell (bare "masculine" gender, not an aggregate)', () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    const nomRow = screen.getByText('Mianownik').closest('tr')!
    const cells = nomRow.querySelectorAll('td')
    expect(cells).toHaveLength(3)
    expect(cells[0]!.getAttribute('colSpan')).toBe('3')
    expect(cells[0]!.textContent).toBe('absolutny')
  })
})

describe('dobry — degrees of comparison (FR-69)', () => {
  it('shows positive/comparative/superlative as lepszy/najlepszy, the irregular case', () => {
    renderTable(DOBRY_ID, dobryParadigm)
    expect(screen.getByText('Stopień wyższy:')).toBeInTheDocument()
    expect(screen.getByText('lepszy')).toBeInTheDocument()
    expect(screen.getByText('Stopień najwyższy:')).toBeInTheDocument()
    expect(screen.getByText('najlepszy')).toBeInTheDocument()
  })
})

describe('dobry — clicking the comparative row launches a real exercise (task 22 acceptance check)', () => {
  it('the comparative row is a button; clicking it navigates to /session targeting exactly adj:degree:comparative', async () => {
    const user = userEvent.setup()
    renderTable(DOBRY_ID, dobryParadigm)

    const button = screen.getByRole('button', { name: /Stopień wyższy.*lepszy.*новое/i })
    await user.click(button)

    const state = JSON.parse(screen.getByTestId('session-state').textContent ?? '{}') as {
      targetSkillIds?: string[]
    }
    expect(state.targetSkillIds).toEqual([encodeSkillId(DOBRY_ID, 'adj:degree:comparative')])
  })

  it('an already-materialized comparative skill shows its FSRS percentage instead of "новое"', () => {
    const skill: SkillRecord = {
      skillId: encodeSkillId(DOBRY_ID, 'adj:degree:comparative'),
      wordId: DOBRY_ID,
      kind: 'adj',
      dimension: 'adj:degree:comparative',
      state: 'review',
      stability: 30, // TARGET_STABILITY_DAYS is 60 -> 50%
      difficulty: 3,
      due: 0,
      reps: 1,
      lapses: 0,
      correct: 1,
      incorrect: 0,
      createdAt: 0,
      updatedAt: 0,
    }
    renderTable(DOBRY_ID, dobryParadigm, [skill])
    expect(screen.getByRole('button', { name: /Stopień wyższy.*50%/i })).toBeInTheDocument()
  })
})

describe('a word with no irregular comparison shows only the positive-degree row', () => {
  it('absolutny has no comparative/superlative forms in the data — those two rows are absent', () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    // The citation slot itself (`adj:degree:positive`) always matches, so the block still
    // renders — just without a comparative/superlative row (acceptance: "Степени сравнения
    // показываются только у слов, где они есть").
    expect(screen.getByText('Stopień równy:')).toBeInTheDocument()
    expect(screen.queryByText('Stopień wyższy:')).not.toBeInTheDocument()
    expect(screen.queryByText('Stopień najwyższy:')).not.toBeInTheDocument()
  })
})

describe('table stays inside a horizontal-scroll wrapper (NFR-04, 320px)', () => {
  it('the table has a min-width and sits inside an overflow-x-auto parent', () => {
    renderTable(ABSOLUTNY_ID, absolutnyParadigm)
    const table = screen.getByRole('table')
    expect(table.className).toContain('min-w-')
    expect(table.parentElement?.className).toContain('overflow-x-auto')
  })
})
