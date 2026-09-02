import { describe, expect, it } from 'vitest'
import { CASE_VALUES, DEGREE_VALUES, GENDER_VALUES, TENSE_VALUES } from '@/content/codec.ts'
import {
  abbreviateNumber,
  CASE_DISPLAY_ORDER,
  CASE_LABELS,
  describeDimension,
  DEGREE_DISPLAY_ORDER,
  DEGREE_LABELS,
  expandNumberAbbrev,
  GENDER_DISPLAY_ORDER,
  GENDER_LABELS,
  NUMBER_DISPLAY_ORDER,
  NUMBER_LABELS,
  TENSE_DISPLAY_ORDER,
  TENSE_LABELS,
} from './dimensions.ts'

describe('number abbreviation', () => {
  it('abbreviates and expands round-trip for both values', () => {
    expect(abbreviateNumber('singular')).toBe('sg')
    expect(abbreviateNumber('plural')).toBe('pl')
    expect(expandNumberAbbrev('sg')).toBe('singular')
    expect(expandNumberAbbrev('pl')).toBe('plural')
    expect(expandNumberAbbrev(abbreviateNumber('singular'))).toBe('singular')
    expect(expandNumberAbbrev(abbreviateNumber('plural'))).toBe('plural')
  })
})

describe('canonical display order', () => {
  it('case order is exactly the 7 Polish cases in school-mnemonic order (M. D. C. B. N. Ms. W.)', () => {
    expect(CASE_DISPLAY_ORDER).toEqual([
      'nominative',
      'genitive',
      'dative',
      'accusative',
      'instrumental',
      'locative',
      'vocative',
    ])
    expect(new Set(CASE_DISPLAY_ORDER)).toEqual(new Set(CASE_VALUES))
  })

  it('number order is singular then plural', () => {
    expect(NUMBER_DISPLAY_ORDER).toEqual(['singular', 'plural'])
  })

  it('tense order is present, past, future', () => {
    expect(TENSE_DISPLAY_ORDER).toEqual(['present', 'past', 'future'])
    expect(new Set(TENSE_DISPLAY_ORDER)).toEqual(new Set(TENSE_VALUES))
  })

  it('degree order is positive, comparative, superlative', () => {
    expect(DEGREE_DISPLAY_ORDER).toEqual(['positive', 'comparative', 'superlative'])
    expect(new Set(DEGREE_DISPLAY_ORDER)).toEqual(new Set(DEGREE_VALUES))
  })

  it('gender display order lists exactly the 5 concrete declension genders, no aggregates', () => {
    expect(GENDER_DISPLAY_ORDER).toEqual([
      'masculine_personal',
      'masculine_animate',
      'masculine_inanimate',
      'feminine',
      'neuter',
    ])
  })
})

describe('bilingual labels', () => {
  it('every case has a Polish and Russian label', () => {
    for (const c of CASE_VALUES) {
      expect(CASE_LABELS[c].pl.length).toBeGreaterThan(0)
      expect(CASE_LABELS[c].ru.length).toBeGreaterThan(0)
    }
  })

  it('every tense and degree has a label', () => {
    for (const t of TENSE_VALUES) expect(TENSE_LABELS[t].pl.length).toBeGreaterThan(0)
    for (const d of DEGREE_VALUES) expect(DEGREE_LABELS[d].pl.length).toBeGreaterThan(0)
  })

  it('every one of the 10 GENDER_VALUES (5 concrete + 4 ADJ aggregates + bare masculine) has a label', () => {
    for (const g of GENDER_VALUES) {
      expect(GENDER_LABELS[g].pl.length).toBeGreaterThan(0)
      expect(GENDER_LABELS[g].ru.length).toBeGreaterThan(0)
    }
  })

  it('Polish label is the primary term, distinct from the Russian one, for every case', () => {
    for (const c of CASE_VALUES) {
      expect(CASE_LABELS[c].pl).not.toBe(CASE_LABELS[c].ru)
    }
  })

  it('pins the genitive label (Dopełniacz / Родительный) from the task text example', () => {
    expect(CASE_LABELS.genitive).toEqual({ pl: 'Dopełniacz', ru: 'Родительный' })
  })

  it('NUMBER_LABELS covers both values', () => {
    expect(NUMBER_LABELS.singular.pl.length).toBeGreaterThan(0)
    expect(NUMBER_LABELS.plural.pl.length).toBeGreaterThan(0)
  })
})

describe('describeDimension (task 18, spec/tasks/18-noun-exercises.md step 6)', () => {
  it('a NOUN dimension resolves to case (primary) + number (secondary)', () => {
    expect(describeDimension('noun:sg:genitive')).toEqual({
      primary: { pl: 'Dopełniacz', ru: 'Родительный' },
      secondary: { pl: 'Liczba pojedyncza', ru: 'Единственное число' },
    })
    expect(describeDimension('noun:pl:instrumental')).toEqual({
      primary: { pl: 'Narzędnik', ru: 'Творительный' },
      secondary: { pl: 'Liczba mnoga', ru: 'Множественное число' },
    })
  })

  it('every noun case x number combination resolves without throwing', () => {
    for (const numberAbbrev of ['sg', 'pl'] as const) {
      for (const caseValue of CASE_DISPLAY_ORDER) {
        const dimension = `noun:${numberAbbrev}:${caseValue}` as const
        expect(() => describeDimension(dimension)).not.toThrow()
        expect(describeDimension(dimension).primary.pl).toBe(CASE_LABELS[caseValue].pl)
      }
    }
  })

  it('a not-yet-implemented dimension kind falls back to the raw string rather than throwing', () => {
    const display = describeDimension('vocab:pl-ru')
    expect(display.primary).toEqual({ pl: 'vocab:pl-ru', ru: 'vocab:pl-ru' })
    expect(display.secondary).toBeUndefined()
  })
})

describe('describeDimension — VERB (task 21, spec/tasks/21-verb-exercises.md)', () => {
  it('present/future resolve to pronoun (primary) + tense (secondary), no tertiary', () => {
    expect(describeDimension('verb:present:2:sg')).toEqual({
      primary: { pl: 'ty', ru: 'ты' },
      secondary: { pl: 'Czas teraźniejszy', ru: 'Настоящее время' },
    })
    expect(describeDimension('verb:present:1:pl')).toEqual({
      primary: { pl: 'my', ru: 'мы' },
      secondary: { pl: 'Czas teraźniejszy', ru: 'Настоящее время' },
    })
    expect(describeDimension('verb:future:1:pl').primary).toEqual({ pl: 'my', ru: 'мы' })
    expect(describeDimension('verb:future:1:pl').secondary).toEqual({
      pl: 'Czas przyszły',
      ru: 'Будущее время',
    })
    expect(describeDimension('verb:present:2:sg').tertiary).toBeUndefined()
  })

  it('3rd person present/future has no gender to disambiguate, so pronoun is a combined form', () => {
    expect(describeDimension('verb:present:3:sg').primary).toEqual({
      pl: 'on · ona · ono',
      ru: 'он · она · оно',
    })
    expect(describeDimension('verb:present:3:pl').primary).toEqual({
      pl: 'oni · one',
      ru: 'они',
    })
  })

  it('imperative resolves to pronoun (primary) + mood (secondary)', () => {
    expect(describeDimension('verb:imperative:2:sg')).toEqual({
      primary: { pl: 'ty', ru: 'ты' },
      secondary: { pl: 'Tryb rozkazujący', ru: 'Повелительное наклонение' },
    })
  })

  it('past ALWAYS resolves to 3 components — pronoun, gender, tense (FR-66)', () => {
    // The task text's own example: "ja + mężczyzna → robiłem".
    expect(describeDimension('verb:past:1:sg:masculine')).toEqual({
      primary: { pl: 'ja', ru: 'я' },
      secondary: { pl: 'mężczyzna', ru: 'мужчина' },
      tertiary: { pl: 'Czas przeszły', ru: 'Прошедшее время' },
    })
    // And its "or": "ja + kobieta → robiłam".
    expect(describeDimension('verb:past:1:sg:feminine')).toEqual({
      primary: { pl: 'ja', ru: 'я' },
      secondary: { pl: 'kobieta', ru: 'женщина' },
      tertiary: { pl: 'Czas przeszły', ru: 'Прошедшее время' },
    })
  })

  it('past 3rd person resolves the exact pronoun from gender, unlike present/future', () => {
    expect(describeDimension('verb:past:3:sg:masculine').primary).toEqual({ pl: 'on', ru: 'он' })
    expect(describeDimension('verb:past:3:sg:feminine').primary).toEqual({ pl: 'ona', ru: 'она' })
    expect(describeDimension('verb:past:3:sg:neuter').primary).toEqual({ pl: 'ono', ru: 'оно' })
    expect(describeDimension('verb:past:3:pl:masculine_personal').primary).toEqual({
      pl: 'oni',
      ru: 'они',
    })
    expect(describeDimension('verb:past:3:pl:non_masculine_personal').primary).toEqual({
      pl: 'one',
      ru: 'они',
    })
  })

  it('past 1st/2nd person pronoun never varies by gender (only the verb form itself does)', () => {
    for (const gender of ['masculine', 'feminine', 'neuter'] as const) {
      expect(describeDimension(`verb:past:1:sg:${gender}`).primary).toEqual({ pl: 'ja', ru: 'я' })
      expect(describeDimension(`verb:past:2:sg:${gender}`).primary).toEqual({ pl: 'ty', ru: 'ты' })
    }
  })

  it('every real VERB dimension shape resolves without throwing', () => {
    for (const tense of ['present', 'future'] as const) {
      for (const person of [1, 2, 3] as const) {
        for (const numberAbbrev of ['sg', 'pl'] as const) {
          const dimension = `verb:${tense}:${person}:${numberAbbrev}` as const
          expect(() => describeDimension(dimension)).not.toThrow()
        }
      }
    }
    for (const person of [1, 2, 3] as const) {
      for (const numberAbbrev of ['sg', 'pl'] as const) {
        expect(() => describeDimension(`verb:imperative:${person}:${numberAbbrev}`)).not.toThrow()
      }
    }
    const pastCombos = [
      ['sg', 'masculine'],
      ['sg', 'feminine'],
      ['sg', 'neuter'],
      ['pl', 'masculine_personal'],
      ['pl', 'non_masculine_personal'],
    ] as const
    for (const person of [1, 2, 3] as const) {
      for (const [numberAbbrev, gender] of pastCombos) {
        expect(() =>
          describeDimension(`verb:past:${person}:${numberAbbrev}:${gender}`),
        ).not.toThrow()
      }
    }
  })
})
