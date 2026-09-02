import { describe, expect, it } from 'vitest'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { SkillRecord, SkillState } from '@/types/progress.ts'
import { pickExerciseType, type PickedExerciseType } from './picker.ts'

function vocabSkill(): SkillDescriptor {
  return {
    skillId: 'kobieta|NOUN::vocab:pl-ru',
    wordId: 'kobieta|NOUN',
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    acceptedAnswers: [],
  }
}

/**
 * Deliberately `noun:sg:accusative`, NOT `noun:sg:genitive` — task 27's `context-sentence`
 * substitution (see the dedicated describe block below) only fires for
 * genitive/dative/instrumental/locative singular; every existing expectation in this
 * describe block predates task 27 and must keep meaning "the plain form-choice/form-input
 * pair", so it needs a dimension task 27 never touches.
 */
function morphSkill(): SkillDescriptor {
  return {
    skillId: 'kobieta|NOUN::noun:sg:accusative',
    wordId: 'kobieta|NOUN',
    kind: 'noun',
    dimension: 'noun:sg:accusative',
    acceptedAnswers: ['kobietę'],
  }
}

/** One of the 4 dimensions task 27's `content/context-templates.ts` bank covers — used only
 *  by the "context-sentence substitution" describe block below. */
function contextEligibleSkill(): SkillDescriptor {
  return {
    skillId: 'kobieta|NOUN::noun:sg:genitive',
    wordId: 'kobieta|NOUN',
    kind: 'noun',
    dimension: 'noun:sg:genitive',
    acceptedAnswers: ['kobiety'],
  }
}

function srs(overrides: Partial<SkillRecord> & { state: SkillState }): SkillRecord {
  return {
    skillId: 'kobieta|NOUN::vocab:pl-ru',
    wordId: 'kobieta|NOUN',
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    stability: 1,
    difficulty: 1,
    due: 0,
    reps: 0,
    lapses: 0,
    correct: 0,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Acceptance: "Round-trip тесты picker на всех состояниях навыка" — every combination of
// (kind, srs state, reps) the task's own state table names, for both a vocab skill and a
// morphological skill, mapped to the exact type the table prescribes.
// ---------------------------------------------------------------------------

describe('pickExerciseType — vocab skill (choice/input pair)', () => {
  const cases: Array<[string, SkillRecord | undefined, PickedExerciseType]> = [
    ['skill absent (never materialized)', undefined, 'choice'],
    ['state=new', srs({ state: 'new', reps: 0 }), 'choice'],
    ['state=learning, reps=0', srs({ state: 'learning', reps: 0 }), 'choice'],
    ['state=learning, reps=1', srs({ state: 'learning', reps: 1 }), 'choice'],
    ['state=learning, reps=2', srs({ state: 'learning', reps: 2 }), 'input'],
    ['state=learning, reps=5', srs({ state: 'learning', reps: 5 }), 'input'],
    ['state=review', srs({ state: 'review', reps: 10 }), 'input'],
    ['state=relearning', srs({ state: 'relearning', reps: 3 }), 'choice'],
  ]

  it.each(cases)('%s -> %s', (_label, record, expected) => {
    expect(pickExerciseType(vocabSkill(), record)).toBe(expected)
  })

  it('state=review with selfAssessOnReview picks self-assess instead of input', () => {
    const record = srs({ state: 'review', reps: 10 })
    expect(pickExerciseType(vocabSkill(), record, { selfAssessOnReview: true })).toBe('self-assess')
  })

  it('selfAssessOnReview has no effect outside state=review', () => {
    const record = srs({ state: 'learning', reps: 0 })
    expect(pickExerciseType(vocabSkill(), record, { selfAssessOnReview: true })).toBe('choice')
  })
})

describe('pickExerciseType — morphological skill (form-choice/form-input pair)', () => {
  const cases: Array<[string, SkillRecord | undefined, PickedExerciseType]> = [
    ['skill absent (never materialized)', undefined, 'form-choice'],
    ['state=new', srs({ state: 'new', reps: 0 }), 'form-choice'],
    ['state=learning, reps=0', srs({ state: 'learning', reps: 0 }), 'form-choice'],
    ['state=learning, reps=1', srs({ state: 'learning', reps: 1 }), 'form-choice'],
    ['state=learning, reps=2', srs({ state: 'learning', reps: 2 }), 'form-input'],
    ['state=review', srs({ state: 'review', reps: 10 }), 'form-input'],
    ['state=relearning', srs({ state: 'relearning', reps: 3 }), 'form-choice'],
  ]

  it.each(cases)('%s -> %s', (_label, record, expected) => {
    expect(pickExerciseType(morphSkill(), record)).toBe(expected)
  })

  it('state=review with selfAssessOnReview picks self-assess for morphology too', () => {
    const record = srs({ state: 'review', reps: 10 })
    expect(pickExerciseType(morphSkill(), record, { selfAssessOnReview: true })).toBe('self-assess')
  })
})

describe('pickExerciseType — determinism', () => {
  it('is a pure function: same inputs always produce the same output', () => {
    const record = srs({ state: 'learning', reps: 1 })
    const results = Array.from({ length: 20 }, () => pickExerciseType(vocabSkill(), record))
    expect(new Set(results).size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// forceCategory (task 19, Practice mode's "Тип задания" restriction) — overrides the
// state-based switch entirely, for both vocab and morphological skills, regardless of what
// `srs` says.
// ---------------------------------------------------------------------------

describe('pickExerciseType — forceCategory (task 19)', () => {
  it('forces recognition (choice/form-choice) even for a review-state skill', () => {
    const record = srs({ state: 'review', reps: 10 })
    expect(pickExerciseType(vocabSkill(), record, { forceCategory: 'recognition' })).toBe('choice')
    expect(pickExerciseType(morphSkill(), record, { forceCategory: 'recognition' })).toBe(
      'form-choice',
    )
  })

  it('forces recall (input/form-input) even for a brand-new (no SkillRecord) skill', () => {
    expect(pickExerciseType(vocabSkill(), undefined, { forceCategory: 'recall' })).toBe('input')
    expect(pickExerciseType(morphSkill(), undefined, { forceCategory: 'recall' })).toBe(
      'form-input',
    )
  })

  it('undefined forceCategory falls back to the normal state-based switch', () => {
    const record = srs({ state: 'review', reps: 10 })
    expect(pickExerciseType(vocabSkill(), record)).toBe('input')
  })
})

// ---------------------------------------------------------------------------
// Task 27 (`spec/tasks/27-context-and-error-analysis.md` §2, FR-63): `context-sentence`
// substitutes for `form-choice` on exactly `noun:sg:<genitive|dative|instrumental
// |locative>` — every other dimension (including this same word's `noun:sg:accusative`,
// covered by `morphSkill()` above) keeps returning plain `form-choice`. Recall
// (`form-input`) is never substituted, for any state.
// ---------------------------------------------------------------------------

describe('pickExerciseType — context-sentence substitution (task 27)', () => {
  const eligibleDimensions = ['genitive', 'dative', 'instrumental', 'locative'] as const

  function skillFor(caseValue: (typeof eligibleDimensions)[number]): SkillDescriptor {
    return {
      skillId: `kobieta|NOUN::noun:sg:${caseValue}`,
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: `noun:sg:${caseValue}` as SkillDescriptor['dimension'],
      acceptedAnswers: ['kobiety'],
    }
  }

  it.each(eligibleDimensions)('state=new, noun:sg:%s -> context-sentence', (caseValue) => {
    expect(pickExerciseType(skillFor(caseValue), undefined)).toBe('context-sentence')
  })

  it.each(eligibleDimensions)(
    'state=learning reps<2, noun:sg:%s -> context-sentence',
    (caseValue) => {
      const record = srs({ state: 'learning', reps: 0 })
      expect(pickExerciseType(skillFor(caseValue), record)).toBe('context-sentence')
    },
  )

  it.each(eligibleDimensions)('state=relearning, noun:sg:%s -> context-sentence', (caseValue) => {
    const record = srs({ state: 'relearning', reps: 3 })
    expect(pickExerciseType(skillFor(caseValue), record)).toBe('context-sentence')
  })

  it('forceCategory: recognition also substitutes context-sentence', () => {
    const record = srs({ state: 'review', reps: 10 })
    expect(pickExerciseType(contextEligibleSkill(), record, { forceCategory: 'recognition' })).toBe(
      'context-sentence',
    )
  })

  it('recall (form-input) is never substituted, even for an eligible dimension', () => {
    const record = srs({ state: 'learning', reps: 2 })
    expect(pickExerciseType(contextEligibleSkill(), record)).toBe('form-input')
    expect(
      pickExerciseType(contextEligibleSkill(), undefined, { forceCategory: 'recall' }),
    ).toBe('form-input')
  })

  it('noun:sg:accusative (not one of the 4 covered cases) keeps plain form-choice', () => {
    expect(pickExerciseType(morphSkill(), undefined)).toBe('form-choice')
  })

  it('a plural dimension of one of the 4 covered cases keeps plain form-choice', () => {
    const skill: SkillDescriptor = {
      skillId: 'kobieta|NOUN::noun:pl:genitive',
      wordId: 'kobieta|NOUN',
      kind: 'noun',
      dimension: 'noun:pl:genitive',
      acceptedAnswers: ['kobiet'],
    }
    expect(pickExerciseType(skill, undefined)).toBe('form-choice')
  })
})
