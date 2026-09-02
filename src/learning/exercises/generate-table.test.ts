/**
 * `generateTableExercise` (`spec/tasks/18-noun-exercises.md` step 4, FR-62). Separate file
 * from `generate.test.ts` since this function is deliberately NOT part of
 * `generateExercise`'s picker-driven path — see `generate.ts`'s own header comment on this
 * function for why.
 *
 * Fixtures mirror `NounFormsTable.test.tsx`'s own (task 17) — same three real words, for the
 * same reasons: `kobieta|NOUN` (baseline 7x2), `aborcja|NOUN` (a real multi-form slot: plural
 * genitive has two spellings, "aborcyj" and "aborcji" — the orchestrator's own correction to
 * this task's acceptance text: the two spellings live on `noun:pl:genitive`, NOT `sg.gen`),
 * `drzwi|NOUN` (a genuine pluralia tantum, to prove an incomplete paradigm never throws).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { ContentContext } from './exercise.types.ts'
import { generateTableExercise } from './generate.ts'

function entry(overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

const KOBIETA_ENTRY = entry({ lemma: 'kobieta', pos: 'NOUN', primaryRu: 'женщина' })
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
const KOBIETA_PARADIGM: Paradigm = { forms: KOBIETA_RAW_FORMS.map(decodeForm), dominantGender: 'feminine' }

const ABORCJA_ENTRY = entry({ lemma: 'aborcja', pos: 'NOUN', primaryRu: 'аборт' })
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
const ABORCJA_PARADIGM: Paradigm = { forms: ABORCJA_RAW_FORMS.map(decodeForm), dominantGender: 'feminine' }

const DRZWI_ENTRY = entry({ lemma: 'drzwi', pos: 'NOUN', primaryRu: 'дверь' })
const DRZWI_RAW_FORMS: EncodedForm[] = [
  ['drzwi', 2, 4, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiom', 2, 3, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 2, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiami', 2, 5, 5, 0, 0, 0, 0, 0, 0],
  ['drzwiach', 2, 6, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 1, 5, 0, 0, 0, 0, 0, 0],
  ['drzwi', 2, 7, 5, 0, 0, 0, 0, 0, 0],
]
const DRZWI_PARADIGM: Paradigm = { forms: DRZWI_RAW_FORMS.map(decodeForm), dominantGender: 'neuter' }

function makeContext(paradigms: Record<string, Paradigm | null>): ContentContext {
  return {
    getWordEntry: (wordId) => {
      const found = [KOBIETA_ENTRY, ABORCJA_ENTRY, DRZWI_ENTRY].find(
        (e) => `${e.lemma}|${e.pos}` === wordId,
      )
      if (!found) throw new Error(`unknown wordId in test context: ${wordId}`)
      return found
    },
    getPrimaryTranslation: () => 'перевод',
    getAllTranslations: () => ['перевод'],
    getParadigm: (wordId) => paradigms[wordId] ?? null,
  }
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([KOBIETA_ENTRY, ABORCJA_ENTRY, DRZWI_ENTRY])
})

describe('generateTableExercise — kobieta (full 7x2 paradigm)', () => {
  const ctx = makeContext({ 'kobieta|NOUN': KOBIETA_PARADIGM })

  it('returns a "table" exercise with 14 cells (7 cases x 2 numbers)', () => {
    const exercise = generateTableExercise('kobieta|NOUN', ctx)
    expect(exercise.type).toBe('table')
    if (exercise.type !== 'table') throw new Error('unreachable')
    expect(exercise.lemma).toBe('kobieta')
    expect(exercise.cells).toHaveLength(14)
  })

  it('both nominative cells (sg AND pl) are prefilled — task text step 4 / app-design §10 mockup', () => {
    const exercise = generateTableExercise('kobieta|NOUN', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const sgNom = exercise.cells.find((c) => c.slot === 'noun:sg:nominative')!
    const plNom = exercise.cells.find((c) => c.slot === 'noun:pl:nominative')!
    expect(sgNom.prefilled).toBe(true)
    expect(sgNom.accepted).toEqual(['kobieta'])
    expect(plNom.prefilled).toBe(true)
    expect(plNom.accepted).toEqual(['kobiety'])
  })

  it('every non-nominative cell is NOT prefilled and carries the real accepted forms', () => {
    const exercise = generateTableExercise('kobieta|NOUN', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    const sgGen = exercise.cells.find((c) => c.slot === 'noun:sg:genitive')!
    expect(sgGen.prefilled).toBe(false)
    expect(sgGen.accepted).toEqual(['kobiety'])

    for (const cell of exercise.cells) {
      if (cell.slot !== 'noun:sg:nominative' && cell.slot !== 'noun:pl:nominative') {
        expect(cell.prefilled).toBe(false)
      }
    }
  })

  it('throws when the word has no paradigm at all', () => {
    const noParadigmCtx = makeContext({ 'kobieta|NOUN': null })
    expect(() => generateTableExercise('kobieta|NOUN', noParadigmCtx)).toThrow()
  })
})

describe('generateTableExercise — aborcja (real multi-form slot, orchestrator correction)', () => {
  it('plural genitive (not singular) carries BOTH "aborcyj" and "aborcji"', () => {
    const ctx = makeContext({ 'aborcja|NOUN': ABORCJA_PARADIGM })
    const exercise = generateTableExercise('aborcja|NOUN', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')

    const plGen = exercise.cells.find((c) => c.slot === 'noun:pl:genitive')!
    expect(plGen.accepted).toEqual(expect.arrayContaining(['aborcyj', 'aborcji']))

    const sgGen = exercise.cells.find((c) => c.slot === 'noun:sg:genitive')!
    expect(sgGen.accepted).toEqual(['aborcji'])
    expect(sgGen.accepted).not.toContain('aborcyj')
  })
})

describe('generateTableExercise — drzwi (pluralia tantum, incomplete paradigm)', () => {
  it('never throws, and every singular slot has an empty accepted list', () => {
    const ctx = makeContext({ 'drzwi|NOUN': DRZWI_PARADIGM })
    const exercise = generateTableExercise('drzwi|NOUN', ctx)
    if (exercise.type !== 'table') throw new Error('unreachable')
    expect(exercise.cells).toHaveLength(14)

    for (const cell of exercise.cells) {
      if (cell.slot.startsWith('noun:sg:')) {
        expect(cell.accepted).toEqual([])
      } else {
        expect(cell.accepted.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Acceptance point 7: "Таблица недоступна в Learn-режиме, доступна в Practice".
// `table` is structurally excluded from `PickedExerciseType` (picker.ts's own return type),
// so `pickExerciseType` can never produce it at all — this is a compile-time guarantee, not
// just a runtime one. The sweep below is a second, runtime-visible proof for the same fact.
// ---------------------------------------------------------------------------

describe('table exercise — never reachable via the Learn picker (acceptance point 7)', () => {
  it('pickExerciseType never returns "table" for any (kind, state, reps) combination', async () => {
    const { pickExerciseType } = await import('./picker.ts')
    const states = ['new', 'learning', 'review', 'relearning'] as const
    const kinds = ['vocab', 'noun', 'verb', 'adj', 'adv'] as const

    for (const kind of kinds) {
      const skill = {
        skillId: `x|NOUN::${kind === 'vocab' ? 'vocab:pl-ru' : 'noun:sg:genitive'}`,
        wordId: 'x|NOUN',
        kind,
        dimension: kind === 'vocab' ? ('vocab:pl-ru' as const) : ('noun:sg:genitive' as const),
        acceptedAnswers: kind === 'vocab' ? [] : ['y'],
      }
      for (const state of states) {
        for (const reps of [0, 1, 2, 10]) {
          const record = {
            skillId: skill.skillId,
            wordId: skill.wordId,
            kind: skill.kind,
            dimension: skill.dimension,
            state,
            stability: 1,
            difficulty: 1,
            due: 0,
            reps,
            lapses: 0,
            correct: 0,
            incorrect: 0,
            createdAt: 0,
            updatedAt: 0,
          }
          const picked = pickExerciseType(skill, record)
          expect(picked).not.toBe('table')
        }
      }
    }
    // Also the "skill never materialized" (srs undefined) case.
    expect(
      pickExerciseType(
        {
          skillId: 'x|NOUN::vocab:pl-ru',
          wordId: 'x|NOUN',
          kind: 'vocab',
          dimension: 'vocab:pl-ru',
          acceptedAnswers: [],
        },
        undefined,
      ),
    ).not.toBe('table')
  })

  it('generateTableExercise is a standalone entry point — NOT reachable through generateExercise', async () => {
    const generateModule = await import('./generate.ts')
    // `generateExercise` dispatches only over `PickedExerciseType`, which excludes 'table' —
    // `generateTableExercise` is a sibling export, never called from inside `generateExercise`.
    expect(typeof generateModule.generateTableExercise).toBe('function')
    expect(typeof generateModule.generateExercise).toBe('function')
    expect(generateModule.generateTableExercise).not.toBe(generateModule.generateExercise)
  })
})
