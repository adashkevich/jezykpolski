import { describe, expect, it } from 'vitest'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import { encodeSkillId, encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'
import type { PracticeCandidateWord, PracticeConfig } from './session.types.ts'
import { buildPracticeQueue } from './build-practice-queue.ts'

function descriptor(wordId: WordId, dimension: Dimension, kind: SkillDescriptor['kind']): SkillDescriptor {
  return {
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    kind,
    dimension,
    acceptedAnswers: kind === 'vocab' ? [] : ['x'],
  }
}

function nounWord(lemma: string): PracticeCandidateWord {
  const wordId = encodeWordId(lemma, 'NOUN')
  return {
    wordId,
    descriptors: [
      descriptor(wordId, 'vocab:pl-ru', 'vocab'),
      descriptor(wordId, 'vocab:ru-pl', 'vocab'),
      descriptor(wordId, 'noun:sg:nominative', 'noun'),
      descriptor(wordId, 'noun:sg:genitive', 'noun'),
      descriptor(wordId, 'noun:pl:genitive', 'noun'),
      descriptor(wordId, 'noun:sg:vocative', 'noun'),
    ],
  }
}

function verbWord(lemma: string): PracticeCandidateWord {
  const wordId = encodeWordId(lemma, 'VERB')
  return {
    wordId,
    descriptors: [
      descriptor(wordId, 'vocab:pl-ru', 'vocab'),
      descriptor(wordId, 'verb:present:1:sg', 'verb'),
      descriptor(wordId, 'verb:present:3:pl', 'verb'),
      descriptor(wordId, 'verb:past:1:sg:masculine', 'verb'),
      descriptor(wordId, 'verb:imperative:2:sg', 'verb'),
    ],
  }
}

function adjWord(lemma: string): PracticeCandidateWord {
  const wordId = encodeWordId(lemma, 'ADJ')
  return {
    wordId,
    descriptors: [
      descriptor(wordId, 'vocab:pl-ru', 'vocab'),
      descriptor(wordId, 'adj:sg:feminine:nominative', 'adj'),
      descriptor(wordId, 'adj:sg:masculine_personal:genitive', 'adj'),
      descriptor(wordId, 'adj:degree:comparative', 'adj'),
      descriptor(wordId, 'adj:degree:superlative', 'adj'),
    ],
  }
}

function baseConfig(overrides: Partial<PracticeConfig>): PracticeConfig {
  return {
    section: 'NOUN',
    upToLevel: null,
    status: [],
    topN: null,
    includeTranslation: false,
    dimensionSelection: {},
    exerciseTypes: { choice: true, input: true },
    targetSize: 20,
    ...overrides,
  }
}

describe('buildPracticeQueue', () => {
  it('matches only the explicitly selected dimensions (NOUN), ignoring any due/SRS state entirely', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({
        section: 'NOUN',
        dimensionSelection: { number: ['sg'], case: ['genitive'] },
      }),
      candidateWords: [nounWord('kobieta'), nounWord('dom')],
      seed: 1,
    })

    // Only "noun:sg:genitive" qualifies (case=genitive AND number=sg) — "noun:pl:genitive"
    // is excluded (number mismatch), "noun:sg:nominative"/"noun:sg:vocative" excluded (case
    // mismatch), vocab excluded (includeTranslation: false).
    expect(plan.totalMatchingSkillCount).toBe(2) // one per word
    expect(plan.totalMatchingWordCount).toBe(2)
    expect(plan.items).toHaveLength(2)
    for (const item of plan.items) {
      expect(item.dimension).toBe('noun:sg:genitive')
    }
  })

  it('includes vocab:pl-ru and vocab:ru-pl together when includeTranslation is on', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({ includeTranslation: true, dimensionSelection: {} }),
      candidateWords: [nounWord('kobieta')],
      seed: 1,
    })
    const dims = plan.items.map((i) => i.dimension).sort()
    expect(dims).toEqual(['vocab:pl-ru', 'vocab:ru-pl'])
  })

  it('an empty dimension selection matches nothing (not "everything") — acceptance point 6', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({ dimensionSelection: {} }),
      candidateWords: [nounWord('kobieta')],
      seed: 1,
    })
    expect(plan.totalMatchingSkillCount).toBe(0)
    expect(plan.totalMatchingWordCount).toBe(0)
    expect(plan.items).toHaveLength(0)
  })

  it('VERB matching: tense+person+number, past ignores gender, imperative never matches', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({
        section: 'VERB',
        dimensionSelection: {
          tense: ['present', 'past'],
          person: ['1', '3'],
          number: ['sg', 'pl'],
        },
      }),
      candidateWords: [verbWord('robic')],
      seed: 1,
    })
    const dims = plan.items.map((i) => i.dimension).sort()
    // present:1:sg (person=1 ok), present:3:pl (person=3 ok), past:1:sg:masculine (tense
    // 'past' checked, person=1, number=sg — gender not filtered). imperative:2:sg never
    // matches regardless of selection.
    expect(dims).toEqual(['verb:past:1:sg:masculine', 'verb:present:1:sg', 'verb:present:3:pl'])
  })

  it('ADJ matching: case-inflection shape and degree shape are independent', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({
        section: 'ADJ',
        dimensionSelection: {
          number: ['sg'],
          gender: ['feminine'],
          case: ['nominative'],
          degree: ['comparative'],
        },
      }),
      candidateWords: [adjWord('dobry')],
      seed: 1,
    })
    const dims = plan.items.map((i) => i.dimension).sort()
    expect(dims).toEqual(['adj:degree:comparative', 'adj:sg:feminine:nominative'])
  })

  it('samples down to targetSize deterministically — same seed, same result', () => {
    const words = Array.from({ length: 10 }, (_, i) => nounWord(`w${i}`))
    const config = baseConfig({
      dimensionSelection: { number: ['sg'], case: ['nominative'] },
      targetSize: 3,
    })
    const first = buildPracticeQueue({ config, candidateWords: words, seed: 42 })
    const again = buildPracticeQueue({ config, candidateWords: words, seed: 42 })
    const differentSeed = buildPracticeQueue({ config, candidateWords: words, seed: 7 })

    expect(first.items).toHaveLength(3)
    // totals reflect the FULL matching pool, not the sampled subset (acceptance point 5).
    expect(first.totalMatchingSkillCount).toBe(10)
    expect(first.totalMatchingWordCount).toBe(10)
    expect(first.items).toEqual(again.items)
    expect(differentSeed.items).not.toEqual(first.items)
  })

  it('targetSize larger than the matching pool returns every match, not padded/duplicated', () => {
    const plan = buildPracticeQueue({
      config: baseConfig({
        dimensionSelection: { number: ['sg'], case: ['nominative'] },
        targetSize: 999,
      }),
      candidateWords: [nounWord('kobieta'), nounWord('dom')],
      seed: 1,
    })
    expect(plan.items).toHaveLength(2)
    expect(plan.totalMatchingSkillCount).toBe(2)
  })
})
