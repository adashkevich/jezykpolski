import { beforeEach, describe, expect, it } from 'vitest'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { DecodedForm } from '@/content/codec.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { Paradigm, WordIndexEntry } from '@/types/content.ts'
import type { SkillRecord, SkillState } from '@/types/progress.ts'
import type { ContentContext } from './exercise.types.ts'
import { generateExercise } from './generate.ts'

// ---------------------------------------------------------------------------
// Fixtures — a tiny word pool (so `pickVocabDistractors`'s naive same-POS sampling has
// candidates) and a hand-built `kobieta|NOUN` paradigm (same shape as the real
// public/content/paradigms/042.json data used in task 03's enumerate.test.ts).
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

const KOBIETA_ENTRY = entry({ lemma: 'kobieta', pos: 'NOUN', rank: 3, primaryRu: 'женщина' })

const KOBIETA_FORMS: DecodedForm[] = [
  { form: 'kobieta', number: 'singular', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'kobiety', number: 'singular', case: 'genitive', gender: 'feminine', analytic: false },
  { form: 'kobiecie', number: 'singular', case: 'dative', gender: 'feminine', analytic: false },
  { form: 'kobietę', number: 'singular', case: 'accusative', gender: 'feminine', analytic: false },
  {
    form: 'kobietą',
    number: 'singular',
    case: 'instrumental',
    gender: 'feminine',
    analytic: false,
  },
  { form: 'kobiety', number: 'plural', case: 'nominative', gender: 'feminine', analytic: false },
  { form: 'kobiet', number: 'plural', case: 'genitive', gender: 'feminine', analytic: false },
]
const KOBIETA_PARADIGM: Paradigm = { forms: KOBIETA_FORMS, dominantGender: 'feminine' }

function makeContext(overrides: Partial<ContentContext> = {}): ContentContext {
  return {
    getWordEntry: (wordId) => {
      if (wordId === 'kobieta|NOUN') return KOBIETA_ENTRY
      throw new Error(`unknown wordId in test context: ${wordId}`)
    },
    getPrimaryTranslation: () => 'женщина',
    getAllTranslations: () => ['женщина', 'дама'],
    getParadigm: (wordId) => (wordId === 'kobieta|NOUN' ? KOBIETA_PARADIGM : null),
    ...overrides,
  }
}

const VOCAB_SKILL: SkillDescriptor = {
  skillId: 'kobieta|NOUN::vocab:pl-ru',
  wordId: 'kobieta|NOUN',
  kind: 'vocab',
  dimension: 'vocab:pl-ru',
  acceptedAnswers: [],
}

const VOCAB_SKILL_RU_PL: SkillDescriptor = {
  ...VOCAB_SKILL,
  skillId: 'kobieta|NOUN::vocab:ru-pl',
  dimension: 'vocab:ru-pl',
}

const NOUN_SKILL: SkillDescriptor = {
  skillId: 'kobieta|NOUN::noun:sg:genitive',
  wordId: 'kobieta|NOUN',
  kind: 'noun',
  dimension: 'noun:sg:genitive',
  acceptedAnswers: ['kobiety'],
}

function srs(state: SkillState, reps = 0): SkillRecord {
  return {
    skillId: VOCAB_SKILL.skillId,
    wordId: VOCAB_SKILL.wordId,
    kind: 'vocab',
    dimension: VOCAB_SKILL.dimension,
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
}

beforeEach(() => {
  __resetIndexStoreForTest()
  initIndexStore([
    KOBIETA_ENTRY,
    entry({ lemma: 'człowiek', pos: 'NOUN', rank: 2, primaryRu: 'человек' }),
    entry({ lemma: 'dom', pos: 'NOUN', rank: 5, primaryRu: 'дом' }),
    entry({ lemma: 'stół', pos: 'NOUN', rank: 8, primaryRu: 'стол' }),
  ])
})

// ---------------------------------------------------------------------------
// Acceptance: "generateExercise с одинаковым seed даёт побайтово одинаковый результат".
// ---------------------------------------------------------------------------

describe('generateExercise — determinism (acceptance)', () => {
  it('choice: identical seed -> deep-equal ExerciseInstance, across separate calls', () => {
    const ctx = makeContext()
    const a = generateExercise(VOCAB_SKILL, undefined, ctx, 12345)
    const b = generateExercise(VOCAB_SKILL, undefined, ctx, 12345)
    expect(a).toEqual(b)
  })

  it('form-choice: identical seed -> deep-equal ExerciseInstance', () => {
    const ctx = makeContext()
    const a = generateExercise(NOUN_SKILL, undefined, ctx, 777)
    const b = generateExercise(NOUN_SKILL, undefined, ctx, 777)
    expect(a).toEqual(b)
  })

  it('input: identical seed -> deep-equal ExerciseInstance', () => {
    const ctx = makeContext()
    const record = srs('learning', 2)
    const a = generateExercise(VOCAB_SKILL, record, ctx, 5)
    const b = generateExercise(VOCAB_SKILL, record, ctx, 5)
    expect(a).toEqual(b)
  })

  it('a different seed can change the id and the option order', () => {
    const ctx = makeContext()
    const a = generateExercise(VOCAB_SKILL, undefined, ctx, 1)
    const b = generateExercise(VOCAB_SKILL, undefined, ctx, 2)
    expect(a.id).not.toBe(b.id)
  })
})

// ---------------------------------------------------------------------------
// Well-formedness per picked type.
// ---------------------------------------------------------------------------

describe('generateExercise — vocab choice', () => {
  it('produces a "choice" exercise whose options include the correct answer exactly once', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(VOCAB_SKILL, undefined, ctx, 42)
    expect(exercise.type).toBe('choice')
    if (exercise.type !== 'choice') throw new Error('unreachable')
    expect(exercise.direction).toBe('pl-ru')
    expect(exercise.prompt).toBe('kobieta')
    expect(exercise.correct).toBe('женщина')
    expect(exercise.options.filter((o) => o === exercise.correct)).toHaveLength(1)
    expect(exercise.options).toContain('женщина')
  })

  it('ru-pl direction shows the RU translation as prompt and the PL lemma as correct', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(VOCAB_SKILL_RU_PL, undefined, ctx, 42)
    expect(exercise.type).toBe('choice')
    if (exercise.type !== 'choice') throw new Error('unreachable')
    expect(exercise.direction).toBe('ru-pl')
    expect(exercise.prompt).toBe('женщина')
    expect(exercise.correct).toBe('kobieta')
  })
})

describe('generateExercise — vocab input', () => {
  it('produces an "input" exercise with the full translation list accepted (pl-ru)', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(VOCAB_SKILL, srs('learning', 2), ctx, 1)
    expect(exercise.type).toBe('input')
    if (exercise.type !== 'input') throw new Error('unreachable')
    expect(exercise.accepted).toEqual(['женщина', 'дама'])
  })

  it('ru-pl input only accepts the lemma', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(VOCAB_SKILL_RU_PL, srs('learning', 2), ctx, 1)
    expect(exercise.type).toBe('input')
    if (exercise.type !== 'input') throw new Error('unreachable')
    expect(exercise.accepted).toEqual(['kobieta'])
  })
})

describe('generateExercise — morphology (form-choice / form-input)', () => {
  it("form-choice: correct is the skill's first accepted answer, options never repeat it as a distractor", () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(NOUN_SKILL, undefined, ctx, 9)
    expect(exercise.type).toBe('form-choice')
    if (exercise.type !== 'form-choice') throw new Error('unreachable')
    expect(exercise.correct).toBe('kobiety')
    expect(exercise.lemma).toBe('kobieta')
    expect(exercise.slot).toBe('noun:sg:genitive')
    expect(exercise.options.filter((o) => o === exercise.correct)).toHaveLength(1)
  })

  it('form-input: accepted comes straight from SkillDescriptor.acceptedAnswers', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(NOUN_SKILL, srs('review'), ctx, 9)
    expect(exercise.type).toBe('form-input')
    if (exercise.type !== 'form-input') throw new Error('unreachable')
    expect(exercise.accepted).toEqual(['kobiety'])
    expect(exercise.slot).toBe('noun:sg:genitive')
  })

  it('form-choice throws when the word has no paradigm', () => {
    const ctx = makeContext({ getParadigm: () => null })
    expect(() => generateExercise(NOUN_SKILL, undefined, ctx, 1)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 18 (`spec/tasks/18-noun-exercises.md` steps 1/2): the `hintMode` option, threaded
// into `form-input`/`form-choice`'s `promptMode`. Acceptance: "Оба направления подсказки
// (лемма / перевод) работают на одном навыке" + "Настройка `случайно` действительно
// чередует подсказки".
// ---------------------------------------------------------------------------

describe('generateExercise — hintMode / promptMode (task 18 acceptance)', () => {
  it('defaults to promptMode "lemma" when hintMode is omitted', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(NOUN_SKILL, undefined, ctx, 9)
    if (exercise.type !== 'form-choice') throw new Error('unreachable')
    expect(exercise.promptMode).toBe('lemma')
  })

  it('the SAME skill produces both promptMode "lemma" and "translation", per hintMode', () => {
    const ctx = makeContext()
    const lemmaVariant = generateExercise(NOUN_SKILL, srs('review'), ctx, 9, { hintMode: 'lemma' })
    const translationVariant = generateExercise(NOUN_SKILL, srs('review'), ctx, 9, {
      hintMode: 'translation',
    })
    if (lemmaVariant.exercise.type !== 'form-input') throw new Error('unreachable')
    if (translationVariant.exercise.type !== 'form-input') throw new Error('unreachable')

    expect(lemmaVariant.skillId).toBe(translationVariant.skillId)
    expect(lemmaVariant.exercise.promptMode).toBe('lemma')
    expect(translationVariant.exercise.promptMode).toBe('translation')
    // Both fields are always present regardless of promptMode — only which one the UI shows
    // first differs (`FormInputExercise.tsx`'s own job, not this module's).
    expect(lemmaVariant.exercise.lemma).toBe('kobieta')
    expect(lemmaVariant.exercise.hint).toBe('женщина')
    expect(translationVariant.exercise.lemma).toBe('kobieta')
    expect(translationVariant.exercise.hint).toBe('женщина')
  })

  it('hintMode "random" alternates promptMode deterministically across seeds', () => {
    const ctx = makeContext()
    const modes = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      const { exercise } = generateExercise(NOUN_SKILL, srs('review'), ctx, seed, {
        hintMode: 'random',
      })
      if (exercise.type !== 'form-input') throw new Error('unreachable')
      modes.add(exercise.promptMode)
    }
    expect(modes).toEqual(new Set(['lemma', 'translation']))
  })

  it('hintMode "random" is still reproducible for the same seed (determinism acceptance)', () => {
    const ctx = makeContext()
    const a = generateExercise(NOUN_SKILL, srs('review'), ctx, 42, { hintMode: 'random' })
    const b = generateExercise(NOUN_SKILL, srs('review'), ctx, 42, { hintMode: 'random' })
    expect(a).toEqual(b)
  })
})

describe('generateExercise — self-assess', () => {
  it('vocab: prompt/answer are lemma/translation per direction', () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(VOCAB_SKILL, srs('review'), ctx, 1, {
      selfAssessOnReview: true,
    })
    expect(exercise.type).toBe('self-assess')
    if (exercise.type !== 'self-assess') throw new Error('unreachable')
    expect(exercise.prompt).toBe('kobieta')
    expect(exercise.answer).toBe('женщина')
  })

  it("morphology: answer is the slot's accepted form", () => {
    const ctx = makeContext()
    const { exercise } = generateExercise(NOUN_SKILL, srs('review'), ctx, 1, {
      selfAssessOnReview: true,
    })
    expect(exercise.type).toBe('self-assess')
    if (exercise.type !== 'self-assess') throw new Error('unreachable')
    expect(exercise.answer).toBe('kobiety')
  })
})

describe('generateExercise — ExerciseInstance shape', () => {
  it('skillId matches the input skill and id is stable for the same (skill, seed)', () => {
    const ctx = makeContext()
    const instance = generateExercise(VOCAB_SKILL, undefined, ctx, 42)
    expect(instance.skillId).toBe(VOCAB_SKILL.skillId)
    expect(typeof instance.id).toBe('string')
    expect(instance.id.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Task 10 §4 / acceptance: "Распределение позиции правильного ответа равномерно на 1000
// генераций" — `insertAtSeededPosition` (this file, above) is what actually places the
// correct answer among `distractors.ts`'s picks; it lives here (private to `generate.ts`,
// not exported by `distractors.ts`) rather than in task 10's own file, so its uniformity
// property is verified here rather than duplicated. This fixture's NOUN pool is fixed at
// exactly 3 non-target words, so `pickVocabDistractors` always returns exactly
// `DEFAULT_DISTRACTOR_COUNT` (3) distractors regardless of seed, making the correct
// answer's index `seed % 4` — a plain, non-flaky uniformity check across 1000 consecutive
// seeds is enough to catch a systematic-position bug without any statistical machinery.
// ---------------------------------------------------------------------------

describe('generateExercise — correct-answer position distribution (task 10 acceptance)', () => {
  it('choice: correct answer lands in each of the 4 slots ~equally often over 1000 seeds', () => {
    const ctx = makeContext()
    const positionCounts = new Map<number, number>()
    const totalSeeds = 1000

    for (let seed = 0; seed < totalSeeds; seed++) {
      const { exercise } = generateExercise(VOCAB_SKILL, undefined, ctx, seed)
      if (exercise.type !== 'choice') throw new Error('unreachable')
      const position = exercise.options.indexOf(exercise.correct)
      expect(position).toBeGreaterThanOrEqual(0)
      positionCounts.set(position, (positionCounts.get(position) ?? 0) + 1)
    }

    // 1 correct + 3 distractors -> 4 possible slots; every slot must actually occur.
    expect(positionCounts.size).toBe(4)
    const expectedShare = totalSeeds / positionCounts.size
    for (const count of positionCounts.values()) {
      // Generous +/-30% band around the uniform share -- not a strict chi-square test
      // (task text allows either), but enough to fail loudly on a systematically biased
      // position (e.g. "always index 0").
      expect(count).toBeGreaterThan(expectedShare * 0.7)
      expect(count).toBeLessThan(expectedShare * 1.3)
    }
  })
})
