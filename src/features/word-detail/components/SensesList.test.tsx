/**
 * `SensesList` (`spec/tasks/50-word-detail-senses-v2.md` §1): translations, the sense's own
 * level, the «изучаем»/«позже» badge (several senses only), and — when the lazy details shard is
 * in — the Polish gloss and example, plus (task 51) the by/ua translations of the languages the learner knows.
 * Senses/details are shaped like the real `być` entries of `public/content/senses/014.json` /
 * `sense-details/014.json` (checked with a one-off script).
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
    <SensesList status="ready" details={NO_DETAILS} error={undefined} langs={['ru']} {...props} />,
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

  it('the level badge reads the column of the known languages', () => {
    renderList({ senses: [COPULA, EXIST], details: ALL_DETAILS, langs: ['ru', 'ua'] })

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

// Task 51 (`spec/tasks/51-language-profile.md` §3): with by/ua known, every sense gets a line per language
// with that language's translations under the Russian ones. `radzić|VERB` as in the real
// content (`public/content/senses/015.json` + `sense-details/015.json`): three senses, different
// translations in each language.
describe('SensesList — the known languages’ own translations (tasks 51, 52)', () => {
  const ADVISE: Sense = {
    id: 'radzić:advise',
    ru: ['советовать'],
    levels: { ru: 'B1', by: 'A2', ua: 'A2' },
    primary: true,
  }
  const CONSULT: Sense = {
    id: 'radzić:consult',
    ru: ['советоваться'],
    levels: uniformLevels('B1'),
    primary: false,
  }
  const COPE: Sense = {
    id: 'radzić:cope',
    ru: ['справляться'],
    levels: uniformLevels('A2'),
    primary: false,
  }
  const RADZIC_DETAILS: SenseDetailsById = new Map<string, SenseDetails>([
    [
      ADVISE.id,
      {
        gloss: 'udzielać komuś rady',
        example: 'Radzę ci odpocząć.',
        by: ['раіць'],
        ua: ['радити'],
      },
    ],
    [
      CONSULT.id,
      {
        gloss: 'W połączeniu z „się”: prosić kogoś o radę.',
        example: 'Radzę się lekarza w tej sprawie.',
        by: ['раіцца'],
        ua: ['радитися'],
      },
    ],
    [
      COPE.id,
      {
        gloss: 'W połączeniu z „sobie”: pokonywać trudności.',
        example: 'Dobrze radzę sobie z nauką.',
        by: ['спраўляцца'],
        ua: ['давати раду'],
      },
    ],
  ])
  const RADZIC = [ADVISE, CONSULT, COPE]

  it('Russian + Belarusian: every sense shows «бел.» and its Belarusian translations, marked lang="be"', () => {
    renderList({ senses: RADZIC, details: RADZIC_DETAILS, langs: ['ru', 'by'] })

    const items = screen.getAllByRole('listitem')
    const expected = ['раіць', 'раіцца', 'спраўляцца']
    items.forEach((item, i) => {
      expect(within(item).getByText('бел.')).toBeInTheDocument()
      const translations = within(item).getByText(expected[i]!)
      expect(translations).toHaveAttribute('lang', 'be')
    })
    expect(screen.queryByText('укр.')).not.toBeInTheDocument()
    // The Russian translations stay, and the level badge reads the by column.
    expect(within(items[0]!).getByText('советовать')).toBeInTheDocument()
    expect(within(items[0]!).getByText('A2')).toBeInTheDocument()
  })

  it('Russian + Ukrainian: «укр.» with the Ukrainian translations, marked lang="uk"', () => {
    renderList({ senses: RADZIC, details: RADZIC_DETAILS, langs: ['ru', 'ua'] })

    expect(screen.getAllByText('укр.')).toHaveLength(3)
    expect(screen.getByText('давати раду')).toHaveAttribute('lang', 'uk')
    expect(screen.queryByText('бел.')).not.toBeInTheDocument()
  })

  it('Belarusian and Ukrainian both known: both lines on every sense, «бел.» above «укр.»', () => {
    renderList({ senses: RADZIC, details: RADZIC_DETAILS, langs: ['by', 'ua'] })

    const items = screen.getAllByRole('listitem')
    expect(screen.getAllByText('бел.')).toHaveLength(3)
    expect(screen.getAllByText('укр.')).toHaveLength(3)
    const by = within(items[0]!).getByText('раіць')
    const ua = within(items[0]!).getByText('радити')
    expect(by.compareDocumentPosition(ua) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The level is the easier of the two columns (by A2, ua A2 for the first sense).
    expect(within(items[0]!).getByText('A2')).toBeInTheDocument()
  })

  it('Russian only: no extra line at all', () => {
    renderList({ senses: RADZIC, details: RADZIC_DETAILS, langs: ['ru'] })

    expect(screen.queryByText('бел.')).not.toBeInTheDocument()
    expect(screen.queryByText('укр.')).not.toBeInTheDocument()
    expect(screen.queryByText('раіць')).not.toBeInTheDocument()
    expect(document.querySelector('[lang="be"], [lang="uk"]')).toBeNull()
  })

  it('no empty line while the details shard has not arrived', () => {
    renderList({ senses: RADZIC, details: NO_DETAILS, langs: ['ru', 'by'] })

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('бел.')).not.toBeInTheDocument()
    expect(document.querySelector('[lang="be"]')).toBeNull()
  })
})
