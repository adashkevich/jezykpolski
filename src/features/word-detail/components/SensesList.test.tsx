/**
 * `SensesList` (`spec/tasks/50-word-detail-senses-v2.md` §1): translations, the sense's own
 * level, the «изучаем»/«позже» badge (several senses only), and — when the lazy details shard is
 * in — the Polish gloss and example. Senses/details are shaped like the real `być` entries of
 * `public/content/senses/014.json` / `sense-details/014.json` (checked with a one-off script).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { SensesList } from './SensesList.tsx'
import type { SenseDetailsById } from '../hooks/useSenses.ts'
import type { Sense, SenseDetails } from '@/types/content.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'

afterEach(cleanup)

const COPULA: Sense = {
  id: 'być:copula',
  ru: ['быть'],
  levels: uniformLevels('A1'),
  primary: true,
}
const EXIST: Sense = {
  id: 'być:exist',
  ru: ['существовать', 'находиться'],
  levels: { ru: 'A2', by: 'B1', ua: 'B2' },
  primary: false,
}

const COPULA_DETAILS: SenseDetails = {
  gloss: 'łączyć podmiot z informacją o jego cechach lub tożsamości',
  example: 'Anna jest lekarką.',
  by: ['быць'],
  ua: ['бути'],
}
const EXIST_DETAILS: SenseDetails = {
  gloss: 'istnieć lub znajdować się w określonym stanie',
  example: 'Czy na Marsie jest życie?',
  by: ['быць'],
  ua: ['бути'],
}

const ALL_DETAILS: SenseDetailsById = new Map([
  [COPULA.id, COPULA_DETAILS],
  [EXIST.id, EXIST_DETAILS],
])
const NO_DETAILS: SenseDetailsById = new Map()

function renderList(
  props: Partial<React.ComponentProps<typeof SensesList>> & { senses: readonly Sense[] },
) {
  return render(
    <SensesList status="ready" details={NO_DETAILS} error={undefined} profile="ru" {...props} />,
  )
}

describe('SensesList — one sense', () => {
  it('shows translations, level, gloss and example, but no «изучаем»/«позже»', () => {
    renderList({ senses: [COPULA], details: new Map([[COPULA.id, COPULA_DETAILS]]) })

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(within(items[0]!).getByText('быть')).toBeInTheDocument()
    expect(within(items[0]!).getByText('A1')).toBeInTheDocument()
    expect(screen.getByText(COPULA_DETAILS.gloss)).toBeInTheDocument()
    expect(screen.getByText('«Anna jest lekarką.»')).toBeInTheDocument()
    expect(screen.queryByText('изучаем')).not.toBeInTheDocument()
    expect(screen.queryByText('позже')).not.toBeInTheDocument()
  })

  it('the gloss is muted small text, the example is italic — both marked lang="pl"', () => {
    renderList({ senses: [COPULA], details: new Map([[COPULA.id, COPULA_DETAILS]]) })

    const gloss = screen.getByText(COPULA_DETAILS.gloss)
    expect(gloss).toHaveAttribute('lang', 'pl')
    expect(gloss).toHaveClass('text-body-sm', 'text-muted-foreground')
    const example = screen.getByText('«Anna jest lekarką.»')
    expect(example).toHaveAttribute('lang', 'pl')
    expect(example).toHaveClass('italic')
  })
})

describe('SensesList — several senses', () => {
  it('keeps the given order (primary first), each with its own details, level and badge', () => {
    renderList({ senses: [COPULA, EXIST], details: ALL_DETAILS })

    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first!).getByText('быть')).toBeInTheDocument()
    expect(within(first!).getByText('A1')).toBeInTheDocument()
    expect(within(first!).getByText('изучаем')).toBeInTheDocument()
    expect(within(first!).queryByText('позже')).not.toBeInTheDocument()
    expect(within(first!).getByText('«Anna jest lekarką.»')).toBeInTheDocument()

    expect(within(second!).getByText('существовать, находиться')).toBeInTheDocument()
    expect(within(second!).getByText('A2')).toBeInTheDocument()
    expect(within(second!).getByText('позже')).toBeInTheDocument()
    expect(within(second!).queryByText('изучаем')).not.toBeInTheDocument()
    expect(within(second!).getByText(EXIST_DETAILS.gloss)).toBeInTheDocument()
    expect(within(second!).getByText('«Czy na Marsie jest życie?»')).toBeInTheDocument()
  })

  it('the level badge reads the column of the given profile', () => {
    renderList({ senses: [COPULA, EXIST], details: ALL_DETAILS, profile: 'ua' })

    const second = screen.getAllByRole('listitem')[1]!
    expect(within(second).getByText('B2')).toBeInTheDocument()
    expect(within(second).queryByText('A2')).not.toBeInTheDocument()
  })

  it('a sense missing from the details just has no gloss/example; the others keep theirs', () => {
    renderList({ senses: [COPULA, EXIST], details: new Map([[EXIST.id, EXIST_DETAILS]]) })

    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first!).queryByText(/«/)).not.toBeInTheDocument()
    expect(within(second!).getByText('«Czy na Marsie jest życie?»')).toBeInTheDocument()
  })
})

describe('SensesList — without details (shard not loaded yet, or offline)', () => {
  it('shows the translations and levels only, with no gloss, example or error message', () => {
    renderList({ senses: [COPULA, EXIST], details: NO_DETAILS })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('быть')).toBeInTheDocument()
    expect(screen.getByText('существовать, находиться')).toBeInTheDocument()
    expect(screen.getByText('изучаем')).toBeInTheDocument()
    expect(screen.getByText('позже')).toBeInTheDocument()
    expect(screen.queryByText(/«/)).not.toBeInTheDocument()
    expect(document.querySelector('[lang="pl"]')).toBeNull()
    expect(screen.queryByText(/Не удалось/)).not.toBeInTheDocument()
  })
})

describe('SensesList — loading / error / empty', () => {
  it('loading', () => {
    renderList({ status: 'loading', senses: [] })
    expect(screen.getByText('Загрузка значений…')).toBeInTheDocument()
  })

  it('error carries the message', () => {
    renderList({ status: 'error', senses: [], error: new Error('boom') })
    expect(screen.getByText('Не удалось загрузить значения: boom.')).toBeInTheDocument()
  })

  it('renders nothing for a word with no senses', () => {
    const { container } = renderList({ senses: [] })
    expect(container).toBeEmptyDOMElement()
  })
})
