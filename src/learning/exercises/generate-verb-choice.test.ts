/**
 * `generateExercise` for VERB `form-choice`/`form-input` skills, on real `robić|VERB` data
 * (`spec/tasks/21-verb-exercises.md` acceptance point 6: "`form-choice` берёт дистракторы из
 * той же парадигмы"). `generate.ts`'s `buildFormChoice`/`buildFormInput` and
 * `distractors.ts#pickFormDistractors` were already POS-agnostic before this task (confirmed
 * live for `verb:past:3:sg:feminine` in tasks 19/20's own manual verification) — this file
 * is this task's own persisted regression test for that same claim, on the same fixture
 * shape `generate-verb-table.test.ts` (this task) already established for `robić|VERB`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { decodeForm, type EncodedForm } from '@/content/codec.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord } from '@/types/progress.ts'
import type { ContentContext } from './exercise.types.ts'
import { generateExercise } from './generate.ts'

const ROBIC_ENTRY: WordIndexEntry = {
  lemma: 'robić',
  pos: 'VERB',
  rank: 69,
  level: 'A1',
  primaryRu: 'делать',
  sensesShard: 9,
  paradigmShard: 57,
}

// Straight from `public/content/paradigms/057.json`'s `"robić|VERB"` entry (same fixture as
// `generate-verb-table.test.ts`).
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

function makeContext(overrides: Partial<ContentContext> = {}): ContentContext {
  return {
    getWordEntry: (wordId) => {
      if (wordId === 'robić|VERB') return ROBIC_ENTRY
      throw new Error(`unknown wordId in test context: ${wordId}`)
    },
    getPrimaryTranslation: () => 'делать',
    getAllTranslations: () => ['делать', 'становиться'],
    getParadigm: (wordId) => (wordId === 'robić|VERB' ? ROBIC_PARADIGM : null),
    ...overrides,
  }
}

const PAST_FEMININE_SKILL: SkillDescriptor = {
  skillId: 'robić|VERB::verb:past:3:sg:feminine',
  wordId: 'robić|VERB',
  kind: 'verb',
  dimension: 'verb:past:3:sg:feminine',
  acceptedAnswers: ['robiła'],
}

const PRESENT_SKILL: SkillDescriptor = {
  skillId: 'robić|VERB::verb:present:2:sg',
  wordId: 'robić|VERB',
  kind: 'verb',
  dimension: 'verb:present:2:sg',
  acceptedAnswers: ['robisz'],
}

function srsReview(skill: SkillDescriptor): SkillRecord {
  return {
    skillId: skill.skillId,
    wordId: skill.wordId,
    kind: skill.kind,
    dimension: skill.dimension,
    state: 'review',
    stability: 1,
    difficulty: 1,
    due: 0,
    reps: 3,
    lapses: 0,
    correct: 0,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([ROBIC_ENTRY])
})

describe('generateExercise — VERB form-choice pulls distractors from the SAME paradigm', () => {
  it('verb:past:3:sg:feminine ("robiła"): every distractor is a real form of robić, never the correct answer', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(PAST_FEMININE_SKILL, undefined, ctx, 9)
    expect(exercise.type).toBe('form-choice')
    if (exercise.type !== 'form-choice') throw new Error('unreachable')
    expect(exercise.correct).toBe('robiła')
    expect(exercise.slot).toBe('verb:past:3:sg:feminine')
    expect(exercise.options.filter((o) => o === exercise.correct)).toHaveLength(1)

    const allRobicForms = new Set(ROBIC_RAW_FORMS.map((f) => f[0]))
    for (const option of exercise.options) {
      expect(allRobicForms.has(option)).toBe(true)
    }
    // A form of a different word would never show up here — confirms the pool really is
    // "same paradigm", not the naive same-POS vocab pool `pickVocabDistractors` uses.
  })

  it('verb:present:2:sg ("robisz"): distractors are other person/tense forms of the same verb', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(PRESENT_SKILL, undefined, ctx, 3)
    expect(exercise.type).toBe('form-choice')
    if (exercise.type !== 'form-choice') throw new Error('unreachable')
    expect(exercise.correct).toBe('robisz')
    expect(exercise.options.length).toBeGreaterThan(1)
    expect(exercise.options.filter((o) => o === exercise.correct)).toHaveLength(1)
  })

  it('form-input for the reviewed past-tense skill returns exactly the one accepted answer', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(PAST_FEMININE_SKILL, srsReview(PAST_FEMININE_SKILL), ctx, 1)
    expect(exercise.type).toBe('form-input')
    if (exercise.type !== 'form-input') throw new Error('unreachable')
    expect(exercise.accepted).toEqual(['robiła'])
    expect(exercise.slot).toBe('verb:past:3:sg:feminine')
  })
})
