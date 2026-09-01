import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import type { SkillId } from '../skills/skill-id.ts'
import { encodeSkillId, encodeWordId } from '../skills/skill-id.ts'
import { enumerateSkills } from '../skills/enumerate.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import {
  aggregateByDimension,
  aggregateWord,
  byCaseKey,
  byGenderKey,
  byNumberKey,
  byTenseKey,
  deriveStatus,
  KNOWN_THRESHOLD,
  MASTERED_THRESHOLD,
  skillMaturity,
  TARGET_STABILITY_DAYS,
  type WordAggregate,
} from './aggregate.ts'

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    skillId: 'x|NOUN::vocab:pl-ru',
    wordId: 'x|NOUN',
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 0,
    difficulty: 5,
    due: 0,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('skillMaturity', () => {
  it('is 0 for an undefined SkillRecord (no record = never shown)', () => {
    expect(skillMaturity(undefined)).toBe(0)
  })

  it('is stability / TARGET_STABILITY_DAYS, clamped to [0, 1]', () => {
    expect(skillMaturity(record({ stability: 0 }))).toBe(0)
    expect(skillMaturity(record({ stability: TARGET_STABILITY_DAYS / 2 }))).toBeCloseTo(0.5)
    expect(skillMaturity(record({ stability: TARGET_STABILITY_DAYS }))).toBe(1)
  })

  it('clamps stability above TARGET_STABILITY_DAYS to 1', () => {
    expect(skillMaturity(record({ stability: TARGET_STABILITY_DAYS * 10 }))).toBe(1)
  })

  it('clamps a negative stability (should not happen, but defends anyway) to 0', () => {
    expect(skillMaturity(record({ stability: -5 }))).toBe(0)
  })
})

describe('aggregateWord', () => {
  const w: WordIndexEntry = {
    lemma: 'kobieta',
    pos: 'NOUN',
    rank: 1,
    level: 'A1',
    primaryRu: 'женщина',
    sensesShard: 0,
    paradigmShard: 0,
  }
  const paradigm: Paradigm = {
    forms: [
      {
        form: 'kobiety',
        number: 'singular',
        case: 'genitive',
        gender: 'feminine',
        analytic: false,
      },
      { form: 'kobiecie', number: 'singular', case: 'dative', gender: 'feminine', analytic: false },
    ],
  }
  const all = enumerateSkills(w, paradigm)

  it('returns all-zero maturities and recordedSkillCount 0 for a word with no SkillRecord at all', () => {
    const agg = aggregateWord(all, new Map())
    expect(agg.vocabMaturity).toBe(0)
    expect(agg.morphMaturity).toBe(0)
    expect(agg.overallMaturity).toBe(0)
    expect(agg.recordedSkillCount).toBe(0)
    expect(agg.totalSkillCount).toBe(all.length)
    expect(agg.wordId).toBe('kobieta|NOUN')
  })

  it('morphMaturity is undefined (not 0) for a word with no paradigm at all', () => {
    const wordWithoutParadigm: WordIndexEntry = { ...w, lemma: 'ja', paradigmShard: -1 }
    const vocabOnly = enumerateSkills(wordWithoutParadigm)
    const agg = aggregateWord(vocabOnly, new Map())
    expect(agg.morphMaturity).toBeUndefined()
    expect(agg.vocabMaturity).toBe(0)
  })

  it('averages maturity per group (vocab, morph, overall) from real records', () => {
    const known = new Map<SkillId, SkillRecord>([
      [encodeSkillId('kobieta|NOUN', 'vocab:pl-ru'), record({ stability: TARGET_STABILITY_DAYS })], // 1.0
      // vocab:ru-pl absent -> 0
      [
        encodeSkillId('kobieta|NOUN', 'noun:sg:genitive'),
        record({ stability: TARGET_STABILITY_DAYS / 2 }),
      ], // 0.5
      // noun:sg:dative absent -> 0
    ])
    const agg = aggregateWord(all, known)
    expect(agg.vocabMaturity).toBeCloseTo((1 + 0) / 2)
    expect(agg.morphMaturity).toBeCloseTo((0.5 + 0) / 2)
    expect(agg.recordedSkillCount).toBe(2)
  })

  it('throws on an empty descriptor list (enumerateSkills never actually produces one)', () => {
    expect(() => aggregateWord([], new Map())).toThrow()
  })
})

describe('deriveStatus — threshold boundaries (architecture.md §5.4)', () => {
  function agg(overrides: Partial<WordAggregate>): WordAggregate {
    return {
      wordId: 'x|NOUN',
      vocabMaturity: 0,
      morphMaturity: 0,
      overallMaturity: 0,
      recordedSkillCount: 1,
      totalSkillCount: 10,
      ...overrides,
    }
  }

  it('"new" whenever there is no recorded skill at all, regardless of maturity values', () => {
    expect(deriveStatus(agg({ recordedSkillCount: 0, vocabMaturity: 1, morphMaturity: 1 }))).toBe(
      'new',
    )
  })

  it('"learning" just below KNOWN_THRESHOLD', () => {
    expect(deriveStatus(agg({ vocabMaturity: KNOWN_THRESHOLD - 0.0001 }))).toBe('learning')
  })

  it('"known", not "learning", exactly at KNOWN_THRESHOLD', () => {
    expect(deriveStatus(agg({ vocabMaturity: KNOWN_THRESHOLD, morphMaturity: 0 }))).toBe('known')
  })

  it('"mastered" exactly at MASTERED_THRESHOLD for both vocab and morphology', () => {
    expect(
      deriveStatus(agg({ vocabMaturity: MASTERED_THRESHOLD, morphMaturity: MASTERED_THRESHOLD })),
    ).toBe('mastered')
  })

  it('"known", not "mastered", when morphMaturity is just under MASTERED_THRESHOLD', () => {
    expect(
      deriveStatus(
        agg({ vocabMaturity: MASTERED_THRESHOLD, morphMaturity: MASTERED_THRESHOLD - 0.0001 }),
      ),
    ).toBe('known')
  })

  it('"known", not "mastered", when vocabMaturity is just under MASTERED_THRESHOLD', () => {
    expect(
      deriveStatus(agg({ vocabMaturity: MASTERED_THRESHOLD - 0.0001, morphMaturity: 1 })),
    ).toBe('known')
  })

  it('a word with no morphology (morphMaturity undefined) can be "mastered" from vocab alone', () => {
    expect(deriveStatus(agg({ vocabMaturity: MASTERED_THRESHOLD, morphMaturity: undefined }))).toBe(
      'mastered',
    )
  })

  it('a word with no morphology is still just "known" below the vocab mastery bar', () => {
    expect(deriveStatus(agg({ vocabMaturity: 0.5, morphMaturity: undefined }))).toBe('known')
  })
})

describe('aggregateByDimension', () => {
  const w: WordIndexEntry = {
    lemma: 'kobieta',
    pos: 'NOUN',
    rank: 1,
    level: 'A1',
    primaryRu: 'женщина',
    sensesShard: 0,
    paradigmShard: 0,
  }
  const paradigm: Paradigm = {
    forms: [
      {
        form: 'kobieta',
        number: 'singular',
        case: 'nominative',
        gender: 'feminine',
        analytic: false,
      },
      {
        form: 'kobiety',
        number: 'singular',
        case: 'genitive',
        gender: 'feminine',
        analytic: false,
      },
      {
        form: 'kobiety',
        number: 'plural',
        case: 'nominative',
        gender: 'feminine',
        analytic: false,
      },
      { form: 'kobiet', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
    ],
  }
  const all = enumerateSkills(w, paradigm)
  const wordId = encodeWordId('kobieta', 'NOUN')

  it('groups by number: singular slots average separately from plural slots', () => {
    const known = new Map<SkillId, SkillRecord>([
      [encodeSkillId(wordId, 'noun:sg:nominative'), record({ stability: TARGET_STABILITY_DAYS })], // 1.0
      [encodeSkillId(wordId, 'noun:sg:genitive'), record({ stability: 0 })], // 0.0
      [
        encodeSkillId(wordId, 'noun:pl:nominative'),
        record({ stability: TARGET_STABILITY_DAYS / 2 }),
      ], // 0.5
    ])
    const bySg = aggregateByDimension(all, known, byNumberKey)
    expect(bySg.get('sg')).toBeCloseTo(0.5) // (1.0 + 0.0) / 2
    expect(bySg.get('pl')).toBeCloseTo(0.25) // (0.5 + 0) / 2, pl:genitive unrecorded -> 0
  })

  it('groups by case, excludes vocab (vocab has no case)', () => {
    const byCase = aggregateByDimension(all, new Map(), byCaseKey)
    expect(byCase.has('vocab:pl-ru')).toBe(false)
    expect([...byCase.keys()].sort()).toEqual(['genitive', 'nominative'])
  })

  it('byTenseKey and byGenderKey return an empty map for a NOUN-only word (no verb/adj skills)', () => {
    expect(aggregateByDimension(all, new Map(), byTenseKey).size).toBe(0)
    expect(aggregateByDimension(all, new Map(), byGenderKey).size).toBe(0)
  })

  it('a custom keyOf can exclude everything, yielding an empty map', () => {
    expect(aggregateByDimension(all, new Map(), () => undefined).size).toBe(0)
  })
})

describe('aggregateByDimension — VERB and ADJ key extractors', () => {
  const verbWord: WordIndexEntry = {
    lemma: 'mieć',
    pos: 'VERB',
    rank: 1,
    level: 'A1',
    primaryRu: 'иметь',
    sensesShard: 0,
    paradigmShard: 0,
  }
  const verbSkills = enumerateSkills(verbWord, {
    forms: [
      {
        form: 'mam',
        number: 'singular',
        person: 1,
        tense: 'present',
        mood: 'indicative',
        aspect: 'imperfective',
        analytic: false,
      },
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
        form: 'miej',
        number: 'singular',
        person: 2,
        mood: 'imperative',
        aspect: 'imperfective',
        analytic: false,
      },
    ],
  })

  it('byTenseKey groups present/past, excludes imperative (no tense)', () => {
    const byTense = aggregateByDimension(verbSkills, new Map(), byTenseKey)
    expect([...byTense.keys()].sort()).toEqual(['past', 'present'])
  })

  it('byGenderKey only picks up the past-tense skill', () => {
    const byGender = aggregateByDimension(verbSkills, new Map(), byGenderKey)
    expect([...byGender.keys()]).toEqual(['masculine'])
  })

  it('byNumberKey reads number uniformly across present/past/imperative verb dimensions', () => {
    const byNumber = aggregateByDimension(verbSkills, new Map(), byNumberKey)
    expect([...byNumber.keys()]).toEqual(['sg'])
  })

  const adjWord: WordIndexEntry = {
    lemma: 'dobry',
    pos: 'ADJ',
    rank: 1,
    level: 'A1',
    primaryRu: 'хороший',
    sensesShard: 0,
    paradigmShard: 0,
  }
  const adjSkills = enumerateSkills(adjWord, {
    forms: [
      {
        form: 'dobry',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
        degree: 'positive',
        analytic: false,
      },
      {
        form: 'lepszy',
        number: 'singular',
        case: 'nominative',
        gender: 'masculine',
        degree: 'comparative',
        analytic: false,
      },
    ],
  })

  it('byCaseKey / byGenderKey exclude adj:degree:* (it has neither case nor gender)', () => {
    expect(aggregateByDimension(adjSkills, new Map(), byCaseKey).size).toBe(1)
    expect(aggregateByDimension(adjSkills, new Map(), byGenderKey).size).toBe(1)
  })
})
