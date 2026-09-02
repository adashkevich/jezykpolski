/**
 * `generateVerbTableExercise` (`spec/tasks/21-verb-exercises.md` step 5) — VERB analogue of
 * `generate-table.test.ts`'s NOUN coverage, same fixture convention: real data, hand-copied
 * as `EncodedForm` literals straight from `public/content/paradigms/057.json`'s real
 * `robić|VERB` entry (verified against the live content — see this task's decision log),
 * decoded through the real `decodeForm` rather than hand-built `DecodedForm` objects, so a
 * codec bug would show up here too.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { ContentContext } from './exercise.types.ts'
import { generateVerbTableExercise } from './generate.ts'

const ROBIC_ENTRY: WordIndexEntry = {
  lemma: 'robić',
  pos: 'VERB',
  rank: 69,
  level: 'A1',
  primaryRu: 'делать',
  sensesShard: 9,
  paradigmShard: 57,
}

// Straight from `public/content/paradigms/057.json`'s `"robić|VERB"` entry.
const ROBIC_RAW_FORMS: EncodedForm[] = [
  ['będziemy robić', 2, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziecie robić', 2, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będą robić', 2, 0, 0, 0, 3, 3, 1, 1, 1],
  ['będę robić', 1, 0, 0, 0, 3, 1, 1, 1, 1],
  ['będziesz robić', 1, 0, 0, 0, 3, 2, 1, 1, 1],
  ['będzie robić', 1, 0, 0, 0, 3, 3, 1, 1, 1],
  ['robimy', 2, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robicie', 2, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robią', 2, 0, 0, 0, 1, 3, 1, 1, 0],
  ['robię', 1, 0, 0, 0, 1, 1, 1, 1, 0],
  ['robisz', 1, 0, 0, 0, 1, 2, 1, 1, 0],
  ['robi', 1, 0, 0, 0, 1, 3, 1, 1, 0],
  ['róbmy', 2, 0, 0, 0, 0, 1, 2, 1, 0],
  ['róbcie', 2, 0, 0, 0, 0, 2, 2, 1, 0],
  ['rób', 1, 0, 0, 0, 0, 2, 2, 1, 0],
  ['robić', 0, 0, 0, 0, 0, 0, 3, 1, 0],
  ['robiliśmy', 2, 0, 2, 0, 2, 1, 1, 1, 0],
  ['robiłyśmy', 2, 0, 6, 0, 2, 1, 1, 1, 0],
  ['robiliście', 2, 0, 2, 0, 2, 2, 1, 1, 0],
  ['robiłyście', 2, 0, 6, 0, 2, 2, 1, 1, 0],
  ['robili', 2, 0, 2, 0, 2, 3, 1, 1, 0],
  ['robiły', 2, 0, 6, 0, 2, 3, 1, 1, 0],
  ['robiłom', 1, 0, 5, 0, 2, 1, 1, 1, 0],
  ['robiłem', 1, 0, 10, 0, 2, 1, 1, 1, 0],
  ['robiłam', 1, 0, 1, 0, 2, 1, 1, 1, 0],
  ['robiłeś', 1, 0, 10, 0, 2, 2, 1, 1, 0],
  ['robiłaś', 1, 0, 1, 0, 2, 2, 1, 1, 0],
  ['robiłoś', 1, 0, 5, 0, 2, 2, 1, 1, 0],
  ['robił', 1, 0, 10, 0, 2, 3, 1, 1, 0],
  ['robiła', 1, 0, 1, 0, 2, 3, 1, 1, 0],
  ['robiło', 1, 0, 5, 0, 2, 3, 1, 1, 0],
]
const ROBIC_PARADIGM: Paradigm = { forms: ROBIC_RAW_FORMS.map(decodeForm) }

function makeContext(paradigms: Record<string, Paradigm | null>): ContentContext {
  return {
    getWordEntry: (wordId) => {
      if (wordId !== 'robić|VERB') throw new Error(`unknown wordId in test context: ${wordId}`)
      return ROBIC_ENTRY
    },
    getPrimaryTranslation: () => 'делать',
    getAllTranslations: () => ['делать'],
    getParadigm: (wordId) => paradigms[wordId] ?? null,
  }
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([ROBIC_ENTRY])
})

describe('generateVerbTableExercise — present tense (spec/app-design.md §13 п.5 mockup)', () => {
  const ctx = makeContext({ 'robić|VERB': ROBIC_PARADIGM })

  it('returns exactly the 6 person x number present-tense cells, none prefilled', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'present', ctx)
    expect(exercise.type).toBe('table')
    if (exercise.type !== 'table') throw new Error('unreachable')
    expect(exercise.lemma).toBe('robić')
    expect(exercise.cells).toHaveLength(6)
    expect(exercise.cells.every((c) => c.prefilled === false)).toBe(true)
  })

  it('is ordered ja, ty, on, my, wy, oni — matching the mockup row order exactly', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'present', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    expect(exercise.cells.map((c) => c.slot)).toEqual([
      'verb:present:1:sg',
      'verb:present:2:sg',
      'verb:present:3:sg',
      'verb:present:1:pl',
      'verb:present:2:pl',
      'verb:present:3:pl',
    ])
  })

  it('carries the real present-tense forms as accepted answers', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'present', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const byDim = new Map(exercise.cells.map((c) => [c.slot, c.accepted]))
    expect(byDim.get('verb:present:1:sg')).toEqual(['robię'])
    expect(byDim.get('verb:present:2:sg')).toEqual(['robisz'])
    expect(byDim.get('verb:present:1:pl')).toEqual(['robimy'])
  })

  it('throws when the word has no paradigm at all', () => {
    const noParadigmCtx = makeContext({ 'robić|VERB': null })
    expect(() => generateVerbTableExercise('robić|VERB', 'present', noParadigmCtx)).toThrow()
  })
})

describe('generateVerbTableExercise — future tense (analytic imperfective)', () => {
  const ctx = makeContext({ 'robić|VERB': ROBIC_PARADIGM })

  it('every cell carries the analytic "będę/będziesz/... robić" form', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'future', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const byDim = new Map(exercise.cells.map((c) => [c.slot, c.accepted]))
    expect(byDim.get('verb:future:1:sg')).toEqual(['będę robić'])
    expect(byDim.get('verb:future:1:pl')).toEqual(['będziemy robić'])
  })
})

describe('generateVerbTableExercise — imperative (mood, no 1st person singular in the data)', () => {
  const ctx = makeContext({ 'robić|VERB': ROBIC_PARADIGM })

  it('only includes the slots the paradigm actually has (2sg, 1pl, 2pl — no 1sg/3rd person)', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'imperative', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    expect(exercise.cells.map((c) => c.slot).sort()).toEqual(
      ['verb:imperative:1:pl', 'verb:imperative:2:pl', 'verb:imperative:2:sg'].sort(),
    )
    const byDim = new Map(exercise.cells.map((c) => [c.slot, c.accepted]))
    expect(byDim.get('verb:imperative:2:sg')).toEqual(['rób'])
    expect(byDim.get('verb:imperative:1:pl')).toEqual(['róbmy'])
  })
})

describe('generateVerbTableExercise — past tense (FR-66, gender-split rows)', () => {
  const ctx = makeContext({ 'robić|VERB': ROBIC_PARADIGM })

  it('produces one row per (person, number, gender) combo the paradigm has, grouped by person', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'past', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    // The real data (unlike a hand-wavy "only ja/ty are ever m/f" assumption) also carries
    // neuter 1st/2nd person past forms ("robiłom"/"robiłoś") — grammatically odd for a
    // speaker/listener, but present in the source paradigm, so `enumerateSkills` (and
    // therefore this table) includes them rather than second-guessing the data.
    expect(exercise.cells.map((c) => c.slot)).toEqual([
      'verb:past:1:sg:masculine',
      'verb:past:1:sg:feminine',
      'verb:past:1:sg:neuter',
      'verb:past:1:pl:masculine_personal',
      'verb:past:1:pl:non_masculine_personal',
      'verb:past:2:sg:masculine',
      'verb:past:2:sg:feminine',
      'verb:past:2:sg:neuter',
      'verb:past:2:pl:masculine_personal',
      'verb:past:2:pl:non_masculine_personal',
      'verb:past:3:sg:masculine',
      'verb:past:3:sg:feminine',
      'verb:past:3:sg:neuter',
      'verb:past:3:pl:masculine_personal',
      'verb:past:3:pl:non_masculine_personal',
    ])
  })

  it('"robiłem" (1sg masculine) and "robiłam" (1sg feminine) are two DIFFERENT cells (FR-66)', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'past', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const byDim = new Map(exercise.cells.map((c) => [c.slot, c.accepted]))
    expect(byDim.get('verb:past:1:sg:masculine')).toEqual(['robiłem'])
    expect(byDim.get('verb:past:1:sg:feminine')).toEqual(['robiłam'])
    expect(byDim.get('verb:past:1:sg:masculine')).not.toEqual(byDim.get('verb:past:1:sg:feminine'))
  })

  it('3rd person singular has all 3 genders (masculine "robił", feminine "robiła", neuter "robiło")', () => {
    const exercise = generateVerbTableExercise('robić|VERB', 'past', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const byDim = new Map(exercise.cells.map((c) => [c.slot, c.accepted]))
    expect(byDim.get('verb:past:3:sg:masculine')).toEqual(['robił'])
    expect(byDim.get('verb:past:3:sg:feminine')).toEqual(['robiła'])
    expect(byDim.get('verb:past:3:sg:neuter')).toEqual(['robiło'])
  })
})
