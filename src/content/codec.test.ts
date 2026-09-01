import { describe, expect, it } from 'vitest'
import {
  ADJ_GENDER_AGGREGATE_EXPANSION,
  ADJ_GENDER_AGGREGATES,
  ASPECT_VALUES,
  CASE_VALUES,
  computeDominantGender,
  DEGREE_VALUES,
  decodeForm,
  encodeForm,
  fnv1aHash,
  GENDER_VALUES,
  isAdjGenderAggregate,
  LEVEL_VALUES,
  MOOD_VALUES,
  NUMBER_VALUES,
  paradigmShardIndex,
  PARADIGMS_SHARD_COUNT,
  PERSON_VALUES,
  POS_VALUES,
  senseShardIndex,
  SENSES_SHARD_COUNT,
  shardFileStem,
  shardIndex,
  TENSE_VALUES,
  type EncodedForm,
  type RawFormFields,
  ASPECT,
  CASE,
  DEGREE,
  GENDER,
  LEVEL,
  MOOD,
  NUMBER,
  PERSON,
  POS,
  TENSE,
  type Dictionary,
} from './codec.ts'

/** Type-erased view of a `Dictionary<T>`, so a heterogeneous list of dictionaries with
 *  different `T`s can be iterated over without TS collapsing `codeOf`'s parameter type
 *  via contravariance (a known pitfall when storing generic function types together). */
interface AnyDictionaryCase {
  name: string
  values: readonly unknown[]
  codeOf: (value: unknown) => number
  valueOf: (code: number) => unknown
}

function eraseDictionary<T>(
  name: string,
  dict: Dictionary<T>,
  values: readonly T[],
): AnyDictionaryCase {
  return {
    name,
    values,
    codeOf: (value) => dict.codeOf(value as T | undefined),
    valueOf: (code) => dict.valueOf(code),
  }
}

describe('dictionaries', () => {
  const dictionaries: AnyDictionaryCase[] = [
    eraseDictionary('POS', POS, POS_VALUES),
    eraseDictionary('LEVEL', LEVEL, LEVEL_VALUES),
    eraseDictionary('NUMBER', NUMBER, NUMBER_VALUES),
    eraseDictionary('CASE', CASE, CASE_VALUES),
    eraseDictionary('GENDER', GENDER, GENDER_VALUES),
    eraseDictionary('DEGREE', DEGREE, DEGREE_VALUES),
    eraseDictionary('TENSE', TENSE, TENSE_VALUES),
    eraseDictionary('MOOD', MOOD, MOOD_VALUES),
    eraseDictionary('ASPECT', ASPECT, ASPECT_VALUES),
    eraseDictionary('PERSON', PERSON, PERSON_VALUES),
  ]

  it.each(dictionaries)(
    '$name: codeOf(undefined) is 0 and valueOf(0) is undefined',
    ({ codeOf, valueOf }) => {
      expect(codeOf(undefined)).toBe(0)
      expect(valueOf(0)).toBeUndefined()
    },
  )

  it.each(dictionaries)(
    '$name: every value round-trips through codeOf/valueOf',
    ({ codeOf, valueOf, values }) => {
      for (const value of values) {
        const code = codeOf(value)
        expect(code).toBeGreaterThan(0)
        expect(valueOf(code)).toBe(value)
      }
    },
  )

  it.each(dictionaries)('$name: codes are unique and 1-based contiguous', ({ codeOf, values }) => {
    const codes = values.map((v) => codeOf(v))
    expect(new Set(codes).size).toBe(values.length)
    expect([...codes].sort((a, b) => a - b)).toEqual(values.map((_, i) => i + 1))
  })

  it('GENDER dictionary is the exact 10-value union observed in the real data (NOUN 5 + VERB 5 + ADJ 9, deduplicated)', () => {
    expect(new Set(GENDER_VALUES).size).toBe(10)
    expect(GENDER_VALUES).toHaveLength(10)
  })
})

describe('encodeForm / decodeForm round trip', () => {
  it('round-trips a NOUN form (number + case + gender, no verb/adj dimensions)', () => {
    const raw: RawFormFields = {
      form: 'kobiety',
      number: 'singular',
      case: 'genitive',
      gender: 'feminine',
    }
    const encoded = encodeForm(raw)
    const decoded = decodeForm(encoded)
    expect(decoded).toEqual({
      form: 'kobiety',
      number: 'singular',
      case: 'genitive',
      gender: 'feminine',
      degree: undefined,
      tense: undefined,
      person: undefined,
      mood: undefined,
      aspect: undefined,
      analytic: false,
    })
  })

  it('round-trips an analytic future-tense VERB form (będę robić)', () => {
    const raw: RawFormFields = {
      form: 'będę robić',
      number: 'singular',
      person: 1,
      tense: 'future',
      mood: 'indicative',
      aspect: 'imperfective',
      analytic: true,
    }
    const encoded = encodeForm(raw)
    expect(encoded).toEqual<EncodedForm>([
      'będę robić',
      NUMBER.codeOf('singular'),
      0,
      0,
      0,
      TENSE.codeOf('future'),
      PERSON.codeOf(1),
      MOOD.codeOf('indicative'),
      ASPECT.codeOf('imperfective'),
      1,
    ])
    expect(decodeForm(encoded)).toEqual(raw)
  })

  it('round-trips a past-tense VERB form carrying gender (praet forms)', () => {
    const raw: RawFormFields = {
      form: 'robiłem',
      number: 'singular',
      gender: 'masculine_personal',
      person: 1,
      tense: 'past',
      mood: 'indicative',
      aspect: 'imperfective',
    }
    expect(decodeForm(encodeForm(raw))).toEqual({ ...raw, analytic: false })
  })

  it('round-trips an ADJ form carrying an aggregate gender value (any)', () => {
    const raw: RawFormFields = {
      form: 'absolutnym',
      number: 'plural',
      case: 'dative',
      gender: 'any',
      degree: 'positive',
    }
    expect(decodeForm(encodeForm(raw))).toEqual({ ...raw, analytic: false })
  })

  it('round-trips a bare infinitive with only form + mood + aspect set', () => {
    const raw: RawFormFields = { form: 'adresować', mood: 'infinitive', aspect: 'imperfective' }
    const encoded = encodeForm(raw)
    // Every unset numeric slot is exactly 0, per spec §5.
    expect(encoded[1]).toBe(0) // number
    expect(encoded[2]).toBe(0) // case
    expect(encoded[3]).toBe(0) // gender
    expect(encoded[4]).toBe(0) // degree
    expect(encoded[5]).toBe(0) // tense
    expect(encoded[6]).toBe(0) // person
    expect(encoded[9]).toBe(0) // analytic
    expect(decodeForm(encoded)).toEqual({ ...raw, analytic: false })
  })

  it('round-trips an ADV degree-only form', () => {
    const raw: RawFormFields = { form: 'absolutniej', degree: 'comparative' }
    expect(decodeForm(encodeForm(raw))).toEqual({ ...raw, analytic: false })
  })

  it('preserves duplicate forms occupying different slots without collapsing them (aborcji: gen/dat/loc)', () => {
    const genitive = encodeForm({
      form: 'aborcji',
      number: 'singular',
      case: 'genitive',
      gender: 'feminine',
    })
    const dative = encodeForm({
      form: 'aborcji',
      number: 'singular',
      case: 'dative',
      gender: 'feminine',
    })
    const locative = encodeForm({
      form: 'aborcji',
      number: 'singular',
      case: 'locative',
      gender: 'feminine',
    })
    expect(genitive).not.toEqual(dative)
    expect(dative).not.toEqual(locative)
    expect(genitive[0]).toBe('aborcji')
    expect(dative[0]).toBe('aborcji')
    expect(locative[0]).toBe('aborcji')
  })
})

describe('shard hashing (FNV-1a)', () => {
  it('fnv1aHash is a pure function of the input string (same input -> same output, always)', () => {
    const samples = ['kobieta|NOUN', 'być|VERB', 'absolutny|ADJ', '', 'a|NOUN', 'x|NOUN']
    for (const s of samples) {
      const first = fnv1aHash(s)
      for (let i = 0; i < 5; i++) {
        expect(fnv1aHash(s)).toBe(first)
      }
    }
  })

  it('fnv1aHash returns an unsigned 32-bit integer', () => {
    expect(fnv1aHash('kobieta|NOUN')).toBeGreaterThanOrEqual(0)
    expect(fnv1aHash('kobieta|NOUN')).toBeLessThanOrEqual(0xffffffff)
  })

  it('shardIndex is deterministic and always within [0, shardCount)', () => {
    const ids = ['kobieta|NOUN', 'być|VERB', 'absolutny|ADJ', 'niczym|ADV', 'audi|NOUN']
    for (const id of ids) {
      const a = shardIndex(id, 64)
      const b = shardIndex(id, 64)
      expect(a).toBe(b)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(64)
    }
  })

  it('shardIndex for kobieta|NOUN is stable and pinned to the value produced by the real build (42/64, 10/16)', () => {
    // Pinned against the actual committed data (public/content/index.json row for
    // kobieta|NOUN: paradigmShard 42, sensesShard 10). A change to the hash algorithm
    // would silently re-shard every word between builds — this test catches that.
    expect(paradigmShardIndex('kobieta|NOUN')).toBe(42)
    expect(senseShardIndex('kobieta|NOUN')).toBe(10)
  })

  it('shard number for kobieta|NOUN does not depend on shard assignment of other words', () => {
    // Simulates "adding a word to the dataset" by simply calling the hash function in
    // a different order / after computing unrelated shards first — pure function of the
    // wordId string only, so order can never matter.
    const before = paradigmShardIndex('kobieta|NOUN')
    for (const other of ['nowe_slowo|NOUN', 'zzz|VERB', 'aaa|ADJ']) {
      paradigmShardIndex(other)
    }
    const after = paradigmShardIndex('kobieta|NOUN')
    expect(after).toBe(before)
  })

  it('senseShardIndex uses SENSES_SHARD_COUNT (16) and paradigmShardIndex uses PARADIGMS_SHARD_COUNT (64)', () => {
    expect(SENSES_SHARD_COUNT).toBe(16)
    expect(PARADIGMS_SHARD_COUNT).toBe(64)
    for (let i = 0; i < 50; i++) {
      const id = `word-${i}|NOUN`
      expect(senseShardIndex(id)).toBeLessThan(16)
      expect(paradigmShardIndex(id)).toBeLessThan(64)
    }
  })

  it('shardFileStem zero-pads to 3 digits', () => {
    expect(shardFileStem(0)).toBe('000')
    expect(shardFileStem(7)).toBe('007')
    expect(shardFileStem(42)).toBe('042')
    expect(shardFileStem(63)).toBe('063')
  })

  it('shardIndex throws for a non-positive shard count', () => {
    expect(() => shardIndex('x|NOUN', 0)).toThrow()
    expect(() => shardIndex('x|NOUN', -1)).toThrow()
  })
})

describe('multi-gender NOUN handling (computeDominantGender)', () => {
  it('returns undefined for an empty gender list', () => {
    expect(computeDominantGender([])).toBeUndefined()
  })

  it('returns the single gender when only one is present (the common case, ~94% of nouns)', () => {
    expect(computeDominantGender(['feminine', 'feminine', 'feminine'])).toBe('feminine')
  })

  it('returns the strict majority gender for a multi-gender noun (bmw|NOUN-like: mostly neuter, some masculine_inanimate)', () => {
    const genders = [
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'neuter',
      'masculine_inanimate',
      'masculine_inanimate',
      'masculine_inanimate',
    ] as const
    expect(computeDominantGender(genders)).toBe('neuter')
  })

  it('breaks exact ties deterministically using GENDER_VALUES declaration order, not input order', () => {
    // feminine comes before masculine_personal in GENDER_VALUES, so it must win the tie
    // regardless of which one appears first in the input array.
    expect(computeDominantGender(['masculine_personal', 'feminine'])).toBe('feminine')
    expect(computeDominantGender(['feminine', 'masculine_personal'])).toBe('feminine')
  })

  it('is deterministic across repeated calls with the same (but differently ordered) input', () => {
    const a = computeDominantGender(['neuter', 'masculine_inanimate', 'neuter'])
    const b = computeDominantGender(['masculine_inanimate', 'neuter', 'neuter'])
    expect(a).toBe(b)
    expect(a).toBe('neuter')
  })
})

describe('ADJ gender aggregates', () => {
  it('declares exactly the 4 aggregates called out by spec §2 (any, non_masculine_personal, masculine_animate_or_personal, masculine_or_neuter)', () => {
    expect(new Set(ADJ_GENDER_AGGREGATES)).toEqual(
      new Set([
        'any',
        'non_masculine_personal',
        'masculine_animate_or_personal',
        'masculine_or_neuter',
      ]),
    )
  })

  it('"masculine" (bare) is NOT treated as an aggregate needing expansion', () => {
    expect(isAdjGenderAggregate('masculine')).toBe(false)
  })

  it('every expansion entry only contains concrete (non-aggregate) genders', () => {
    for (const aggregate of ADJ_GENDER_AGGREGATES) {
      for (const concrete of ADJ_GENDER_AGGREGATE_EXPANSION[aggregate]) {
        expect(isAdjGenderAggregate(concrete)).toBe(false)
      }
    }
  })

  it('"any" expands to all five concrete genders (m1.m2.m3.f.n)', () => {
    expect(new Set(ADJ_GENDER_AGGREGATE_EXPANSION.any)).toEqual(
      new Set([
        'masculine_personal',
        'masculine_animate',
        'masculine_inanimate',
        'feminine',
        'neuter',
      ]),
    )
  })

  it('"non_masculine_personal" expands to every concrete gender except masculine_personal (m2.m3.f.n)', () => {
    expect(ADJ_GENDER_AGGREGATE_EXPANSION.non_masculine_personal).not.toContain(
      'masculine_personal',
    )
    expect(new Set(ADJ_GENDER_AGGREGATE_EXPANSION.non_masculine_personal)).toEqual(
      new Set(['masculine_animate', 'masculine_inanimate', 'feminine', 'neuter']),
    )
  })

  it('"masculine_animate_or_personal" expands to masculine_personal + masculine_animate only (m1.m2)', () => {
    expect(new Set(ADJ_GENDER_AGGREGATE_EXPANSION.masculine_animate_or_personal)).toEqual(
      new Set(['masculine_personal', 'masculine_animate']),
    )
  })

  it('"masculine_or_neuter" expands to every concrete gender except feminine (m1.m2.m3.n)', () => {
    expect(ADJ_GENDER_AGGREGATE_EXPANSION.masculine_or_neuter).not.toContain('feminine')
    expect(new Set(ADJ_GENDER_AGGREGATE_EXPANSION.masculine_or_neuter)).toEqual(
      new Set(['masculine_personal', 'masculine_animate', 'masculine_inanimate', 'neuter']),
    )
  })
})
