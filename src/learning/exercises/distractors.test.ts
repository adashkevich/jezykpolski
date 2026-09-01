import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { DecodedForm } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import { pickFormDistractors, pickVocabDistractors } from './distractors.ts'

// ---------------------------------------------------------------------------
// This file tests the NAIVE STUB documented at the top of distractors.ts — determinism and
// well-formedness only, per this task's supervisor-approved resolution of the 09/10
// dependency cycle. Distractor *quality* (rank/level bounds, translation-intersection
// exclusion, etc.) is entirely task 10's acceptance, not this task's.
// ---------------------------------------------------------------------------

function entry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>,
): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([
    entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, primaryRu: 'женщина' }),
    entry({ lemma: 'człowiek', pos: 'NOUN', rank: 2, primaryRu: 'человек' }),
    entry({ lemma: 'dom', pos: 'NOUN', rank: 5, primaryRu: 'дом' }),
    entry({ lemma: 'stół', pos: 'NOUN', rank: 8, primaryRu: 'стол' }),
    entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' }),
    entry({ lemma: 'wiedzieć', pos: 'VERB', rank: 4, primaryRu: 'знать' }),
  ])
})

describe('pickVocabDistractors', () => {
  const target = entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, primaryRu: 'женщина' })

  it('returns n distractors from the same POS pool, excluding the target itself', () => {
    const result = pickVocabDistractors(target, 'pl-ru', 3, 42)
    expect(result).toHaveLength(3)
    expect(result).not.toContain('женщина') // target's own RU translation
    // All 3 same-POS candidates other than the target: człowiek, dom, stół -> their RU.
    expect(new Set(result)).toEqual(new Set(['человек', 'дом', 'стол']))
  })

  it('direction pl-ru returns RU translations; ru-pl returns PL lemmas', () => {
    const plRu = pickVocabDistractors(target, 'pl-ru', 3, 42)
    const ruPl = pickVocabDistractors(target, 'ru-pl', 3, 42)
    expect(new Set(plRu)).toEqual(new Set(['человек', 'дом', 'стол']))
    expect(new Set(ruPl)).toEqual(new Set(['człowiek', 'dom', 'stół']))
  })

  it('never crosses POS: a VERB target only gets VERB candidates', () => {
    const verbTarget = entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' })
    const result = pickVocabDistractors(verbTarget, 'pl-ru', 1, 7)
    expect(result).toEqual(['знать']) // the only other VERB in the pool
  })

  it('same seed -> byte-identical result (determinism, acceptance)', () => {
    const a = pickVocabDistractors(target, 'pl-ru', 3, 99)
    const b = pickVocabDistractors(target, 'pl-ru', 3, 99)
    expect(a).toEqual(b)
  })

  it('different seeds can produce a different order/selection', () => {
    const a = pickVocabDistractors(target, 'pl-ru', 2, 1)
    const b = pickVocabDistractors(target, 'pl-ru', 2, 2)
    // Not a strict inequality assertion (small pool could coincide), just documents intent:
    // both calls are internally consistent regardless.
    expect(a).toHaveLength(2)
    expect(b).toHaveLength(2)
  })

  it('never returns more than the available pool size', () => {
    const verbTarget = entry({ lemma: 'mieć', pos: 'VERB', rank: 1, primaryRu: 'иметь' })
    const result = pickVocabDistractors(verbTarget, 'pl-ru', 10, 1)
    expect(result.length).toBeLessThanOrEqual(1) // only one other VERB exists
  })
})

// ---------------------------------------------------------------------------
// pickFormDistractors — real aborcja|NOUN plural genitive data (public/content/paradigms/023.json,
// as already established in task 03's enumerate.test.ts).
// ---------------------------------------------------------------------------

const ABORCJA_FORMS: DecodedForm[] = [
  { form: 'aborcja', number: 'singular', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'singular', case: 'genitive', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'singular', case: 'dative', gender: 'feminine', analytic: false },
  { form: 'aborcję', number: 'singular', case: 'accusative', gender: 'feminine', analytic: false },
  {
    form: 'aborcją',
    number: 'singular',
    case: 'instrumental',
    gender: 'feminine',
    analytic: false,
  },
  { form: 'aborcji', number: 'singular', case: 'locative', gender: 'feminine', analytic: false },
  { form: 'aborcjo', number: 'singular', case: 'vocative', gender: 'feminine', analytic: false },
  { form: 'aborcje', number: 'plural', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'aborcyj', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
  { form: 'aborcji', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
]

const ABORCJA_PARADIGM: Paradigm = { forms: ABORCJA_FORMS, dominantGender: 'feminine' }

describe('pickFormDistractors', () => {
  it('never includes any accepted answer for the target slot (aborcja pl.gen: aborcyj/aborcji)', () => {
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 5, 3)
    expect(result).not.toContain('aborcji')
    expect(result).not.toContain('aborcyj')
  })

  it('draws from other literal forms in the same paradigm', () => {
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 5, 3)
    const otherForms = ['aborcja', 'aborcję', 'aborcją', 'aborcjo', 'aborcje']
    for (const form of result) {
      expect(otherForms).toContain(form)
    }
  })

  it('same seed -> byte-identical result (determinism, acceptance)', () => {
    const a = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 3, 11)
    const b = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 3, 11)
    expect(a).toEqual(b)
  })

  it('requesting more than the available pool size does not throw, returns what exists', () => {
    expect(() => pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 999, 1)).not.toThrow()
    const result = pickFormDistractors(ABORCJA_PARADIGM, 'noun:pl:genitive', 999, 1)
    expect(result.length).toBeLessThan(ABORCJA_FORMS.length)
  })
})
