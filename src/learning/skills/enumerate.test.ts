import { describe, expect, it } from 'vitest'
import type { DecodedForm } from '@/content/codec.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import { enumerateSkills } from './enumerate.ts'

function word(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>,
): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: '',
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

// `kobieta|NOUN`'s real paradigm (public/content/paradigms/042.json, decoded), 14 forms:
// 7 cases x 2 numbers, gender feminine throughout, no slot with more than one form.
const KOBIETA_FORMS: DecodedForm[] = [
  { form: 'kobiety', number: 'plural', case: 'accusative', gender: 'feminine', analytic: false },
  { form: 'kobietom', number: 'plural', case: 'dative', gender: 'feminine', analytic: false },
  { form: 'kobiet', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
  {
    form: 'kobietami',
    number: 'plural',
    case: 'instrumental',
    gender: 'feminine',
    analytic: false,
  },
  { form: 'kobietach', number: 'plural', case: 'locative', gender: 'feminine', analytic: false },
  { form: 'kobiety', number: 'plural', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'kobiety', number: 'plural', case: 'vocative', gender: 'feminine', analytic: false },
  { form: 'kobietę', number: 'singular', case: 'accusative', gender: 'feminine', analytic: false },
  { form: 'kobiecie', number: 'singular', case: 'dative', gender: 'feminine', analytic: false },
  { form: 'kobiety', number: 'singular', case: 'genitive', gender: 'feminine', analytic: false },
  {
    form: 'kobietą',
    number: 'singular',
    case: 'instrumental',
    gender: 'feminine',
    analytic: false,
  },
  { form: 'kobiecie', number: 'singular', case: 'locative', gender: 'feminine', analytic: false },
  { form: 'kobieta', number: 'singular', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'kobieto', number: 'singular', case: 'vocative', gender: 'feminine', analytic: false },
]

describe('enumerateSkills — NOUN with a paradigm (kobieta|NOUN, real data)', () => {
  const w = word({ lemma: 'kobieta', pos: 'NOUN' })
  const paradigm: Paradigm = { forms: KOBIETA_FORMS, dominantGender: 'feminine' }
  const skills = enumerateSkills(w, paradigm)

  it('produces exactly 2 vocab skills + 14 real noun slots (2 numbers x 7 cases), no more', () => {
    expect(skills).toHaveLength(16)
    expect(skills.filter((s) => s.kind === 'vocab')).toHaveLength(2)
    expect(skills.filter((s) => s.kind === 'noun')).toHaveLength(14)
  })

  it('includes vocab:pl-ru and vocab:ru-pl, wordId-scoped', () => {
    const dims = skills.map((s) => s.dimension)
    expect(dims).toContain('vocab:pl-ru')
    expect(dims).toContain('vocab:ru-pl')
    for (const s of skills) expect(s.wordId).toBe('kobieta|NOUN')
  })

  it('every noun dimension is a real (number, case) slot from the paradigm — none fabricated', () => {
    const nounDims = skills.filter((s) => s.kind === 'noun').map((s) => s.dimension)
    const expected = [
      'noun:sg:nominative',
      'noun:sg:genitive',
      'noun:sg:dative',
      'noun:sg:accusative',
      'noun:sg:instrumental',
      'noun:sg:locative',
      'noun:sg:vocative',
      'noun:pl:nominative',
      'noun:pl:genitive',
      'noun:pl:dative',
      'noun:pl:accusative',
      'noun:pl:instrumental',
      'noun:pl:locative',
      'noun:pl:vocative',
    ]
    expect(new Set(nounDims)).toEqual(new Set(expected))
    // No cartesian-product slot beyond what the paradigm actually has (e.g. no duplicates).
    expect(nounDims).toHaveLength(expected.length)
  })

  it('each single-form slot has exactly one accepted answer matching the real form', () => {
    const genitiveSg = skills.find((s) => s.dimension === 'noun:sg:genitive')
    expect(genitiveSg?.acceptedAnswers).toEqual(['kobiety'])
    const nominativePl = skills.find((s) => s.dimension === 'noun:pl:nominative')
    expect(nominativePl?.acceptedAnswers).toEqual(['kobiety'])
  })

  it('vocab skills carry no accepted answers (translations live in the senses shard, not here)', () => {
    for (const s of skills.filter((s) => s.kind === 'vocab')) {
      expect(s.acceptedAnswers).toEqual([])
    }
  })

  it('every skillId is wordId + "::" + dimension', () => {
    for (const s of skills) expect(s.skillId).toBe(`${s.wordId}::${s.dimension}`)
  })
})

describe('enumerateSkills — word without a paradigm (one of the 14 real words with none)', () => {
  it('returns exactly the 2 vocab skills and does not throw', () => {
    const w = word({ lemma: 'ja', pos: 'NOUN', paradigmShard: -1 })
    expect(() => enumerateSkills(w)).not.toThrow()
    const skills = enumerateSkills(w)
    expect(skills).toHaveLength(2)
    expect(skills.map((s) => s.dimension).sort()).toEqual(['vocab:pl-ru', 'vocab:ru-pl'])
    expect(skills.every((s) => s.kind === 'vocab')).toBe(true)
  })

  it('treats an explicit undefined paradigm the same as an omitted one', () => {
    const w = word({ lemma: 'powinien', pos: 'VERB', paradigmShard: -1 })
    expect(enumerateSkills(w, undefined)).toEqual(enumerateSkills(w))
  })
})

describe('enumerateSkills — multi-form slot (aborcja|NOUN, real data: plural genitive has two spellings)', () => {
  it('collapses "aborcyj" and "aborcji" (both plural genitive) into one skill with two accepted answers', () => {
    const w = word({ lemma: 'aborcja', pos: 'NOUN' })
    const forms: DecodedForm[] = [
      { form: 'aborcyj', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
      { form: 'aborcji', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
      {
        form: 'aborcji',
        number: 'singular',
        case: 'genitive',
        gender: 'feminine',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })

    const plGenitive = skills.filter((s) => s.dimension === 'noun:pl:genitive')
    expect(plGenitive).toHaveLength(1) // one skill, not two
    expect(plGenitive[0]?.acceptedAnswers).toEqual(['aborcyj', 'aborcji'])

    // The singular genitive slot is a different skill and keeps its own single answer.
    const sgGenitive = skills.find((s) => s.dimension === 'noun:sg:genitive')
    expect(sgGenitive?.acceptedAnswers).toEqual(['aborcji'])
  })

  it('does not duplicate an already-seen identical form within the same slot', () => {
    const w = word({ lemma: 'test', pos: 'NOUN' })
    const forms: DecodedForm[] = [
      {
        form: 'testu',
        number: 'singular',
        case: 'genitive',
        gender: 'masculine_inanimate',
        analytic: false,
      },
      {
        form: 'testu',
        number: 'singular',
        case: 'genitive',
        gender: 'masculine_inanimate',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const genitive = skills.find((s) => s.dimension === 'noun:sg:genitive')
    expect(genitive?.acceptedAnswers).toEqual(['testu'])
  })
})

describe('enumerateSkills — ADJ aggregate gender expansion (dobry|ADJ, real data)', () => {
  it('expands a non_masculine_personal plural-accusative form into 4 concrete-gender skills sharing the same answer', () => {
    const w = word({ lemma: 'dobry', pos: 'ADJ' })
    const forms: DecodedForm[] = [
      {
        form: 'dobre',
        number: 'plural',
        case: 'accusative',
        gender: 'non_masculine_personal',
        degree: 'positive',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const adjSkills = skills.filter((s) => s.kind === 'adj')

    expect(adjSkills).toHaveLength(4)
    const dims = adjSkills.map((s) => s.dimension).sort()
    expect(dims).toEqual(
      [
        'adj:pl:masculine_animate:accusative',
        'adj:pl:masculine_inanimate:accusative',
        'adj:pl:feminine:accusative',
        'adj:pl:neuter:accusative',
      ].sort(),
    )
    for (const s of adjSkills) expect(s.acceptedAnswers).toEqual(['dobre'])
    // The aggregate label itself must never leak into a produced dimension.
    expect(dims.some((d) => d.includes('non_masculine_personal'))).toBe(false)
  })

  it('expands "any" into all 5 concrete genders', () => {
    const w = word({ lemma: 'x', pos: 'ADJ' })
    const forms: DecodedForm[] = [
      {
        form: 'xowym',
        number: 'singular',
        case: 'instrumental',
        gender: 'any',
        degree: 'positive',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    expect(skills.filter((s) => s.kind === 'adj')).toHaveLength(5)
  })

  it('does not expand a concrete gender (feminine) — one form in, one skill out', () => {
    const w = word({ lemma: 'dobry', pos: 'ADJ' })
    const forms: DecodedForm[] = [
      {
        form: 'dobrej',
        number: 'singular',
        case: 'genitive',
        gender: 'feminine',
        degree: 'positive',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const adjSkills = skills.filter((s) => s.kind === 'adj')
    expect(adjSkills).toHaveLength(1)
    expect(adjSkills[0]?.dimension).toBe('adj:sg:feminine:genitive')
  })

  it('bare "masculine" is a genuine terminal value, not expanded', () => {
    const w = word({ lemma: 'dobry', pos: 'ADJ' })
    const forms: DecodedForm[] = [
      {
        form: 'dobry',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
        degree: 'positive',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const adjSkills = skills.filter((s) => s.kind === 'adj')
    expect(adjSkills).toHaveLength(1)
    expect(adjSkills[0]?.dimension).toBe('adj:sg:masculine:nominative')
  })

  it('comparative/superlative only produce a skill from the citation slot (sg, nominative, bare masculine)', () => {
    const w = word({ lemma: 'dobry', pos: 'ADJ' })
    const forms: DecodedForm[] = [
      {
        form: 'lepszy',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
        degree: 'comparative',
        analytic: false,
      },
      {
        form: 'najlepszy',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
        degree: 'superlative',
        analytic: false,
      },
      // Fully-declined comparative forms elsewhere in the paradigm must NOT become skills.
      {
        form: 'lepszej',
        number: 'singular',
        case: 'genitive',
        gender: 'feminine',
        degree: 'comparative',
        analytic: false,
      },
      {
        form: 'lepsza',
        number: 'singular',
        case: 'nominative',
        gender: 'feminine',
        degree: 'comparative',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const degreeSkills = skills.filter((s) => s.dimension.startsWith('adj:degree:'))
    expect(degreeSkills).toHaveLength(2)
    expect(degreeSkills.map((s) => s.dimension).sort()).toEqual([
      'adj:degree:comparative',
      'adj:degree:superlative',
    ])
    expect(
      degreeSkills.find((s) => s.dimension === 'adj:degree:comparative')?.acceptedAnswers,
    ).toEqual(['lepszy'])
    // The full case-declined table only ever reflects the positive degree.
    expect(skills.some((s) => s.dimension === 'adj:sg:feminine:genitive')).toBe(false)
    expect(skills.some((s) => s.dimension === 'adj:sg:feminine:nominative')).toBe(false)
  })
})

describe('enumerateSkills — VERB (mieć|VERB, real data shapes)', () => {
  const w = word({ lemma: 'mieć', pos: 'VERB' })

  it('bare infinitive mood produces no skill (it duplicates the vocab lemma)', () => {
    const forms: DecodedForm[] = [
      { form: 'mieć', mood: 'infinitive', aspect: 'imperfective', analytic: false },
    ]
    const skills = enumerateSkills(w, { forms })
    expect(skills).toHaveLength(2) // vocab only
  })

  it('present tense -> verb:present:<person>:<number>', () => {
    const forms: DecodedForm[] = [
      {
        form: 'mam',
        number: 'singular',
        person: 1,
        tense: 'present',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const verbSkill = skills.find((s) => s.kind === 'verb')
    expect(verbSkill?.dimension).toBe('verb:present:1:sg')
    expect(verbSkill?.acceptedAnswers).toEqual(['mam'])
  })

  it('analytic future tense (imperfective) -> verb:future:<person>:<number>, one skill for the whole phrase', () => {
    const forms: DecodedForm[] = [
      {
        form: 'będę mieć',
        number: 'singular',
        person: 1,
        tense: 'future',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: true,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const verbSkill = skills.find((s) => s.kind === 'verb')
    expect(verbSkill?.dimension).toBe('verb:future:1:sg')
    expect(verbSkill?.acceptedAnswers).toEqual(['będę mieć'])
  })

  it('past tense -> verb:past:<person>:<number>:<gender> (singular distinguishes m/f/n)', () => {
    const forms: DecodedForm[] = [
      {
        form: 'miałem',
        number: 'singular',
        person: 1,
        gender: 'masculine',
        tense: 'past',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
      {
        form: 'miałam',
        number: 'singular',
        person: 1,
        gender: 'feminine',
        tense: 'past',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
      {
        form: 'miałom',
        number: 'singular',
        person: 1,
        gender: 'neuter',
        tense: 'past',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const dims = skills
      .filter((s) => s.kind === 'verb')
      .map((s) => s.dimension)
      .sort()
    expect(dims).toEqual([
      'verb:past:1:sg:feminine',
      'verb:past:1:sg:masculine',
      'verb:past:1:sg:neuter',
    ])
  })

  it('past tense plural uses non_masculine_personal / masculine_personal as terminal gender values (not expanded)', () => {
    const forms: DecodedForm[] = [
      {
        form: 'mieliśmy',
        number: 'plural',
        person: 1,
        gender: 'masculine_personal',
        tense: 'past',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
      {
        form: 'miałyśmy',
        number: 'plural',
        person: 1,
        gender: 'non_masculine_personal',
        tense: 'past',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const dims = skills
      .filter((s) => s.kind === 'verb')
      .map((s) => s.dimension)
      .sort()
    expect(dims).toEqual([
      'verb:past:1:pl:masculine_personal',
      'verb:past:1:pl:non_masculine_personal',
    ])
  })

  it('imperative -> verb:imperative:<person>:<number>', () => {
    const forms: DecodedForm[] = [
      {
        form: 'miej',
        number: 'singular',
        person: 2,
        mood: 'imperative',
        aspect: 'imperfective',
        analytic: false,
      },
      {
        form: 'miejmy',
        number: 'plural',
        person: 1,
        mood: 'imperative',
        aspect: 'imperfective',
        analytic: false,
      },
    ]
    const skills = enumerateSkills(w, { forms })
    const dims = skills
      .filter((s) => s.kind === 'verb')
      .map((s) => s.dimension)
      .sort()
    expect(dims).toEqual(['verb:imperative:1:pl', 'verb:imperative:2:sg'])
  })
})

describe('enumerateSkills — ADV (szybko|ADV, real data shapes)', () => {
  it('positive degree produces no skill (== the lemma, already vocab)', () => {
    const w = word({ lemma: 'szybko', pos: 'ADV' })
    const forms: DecodedForm[] = [{ form: 'szybko', degree: 'positive', analytic: false }]
    expect(enumerateSkills(w, { forms })).toHaveLength(2)
  })

  it('comparative/superlative -> adv:degree:<degree>', () => {
    const w = word({ lemma: 'szybko', pos: 'ADV' })
    const forms: DecodedForm[] = [
      { form: 'szybciej', degree: 'comparative', analytic: false },
      { form: 'najszybciej', degree: 'superlative', analytic: false },
    ]
    const skills = enumerateSkills(w, { forms })
    const advSkills = skills.filter((s) => s.kind === 'adv')
    expect(advSkills.map((s) => s.dimension).sort()).toEqual([
      'adv:degree:comparative',
      'adv:degree:superlative',
    ])
  })
})
