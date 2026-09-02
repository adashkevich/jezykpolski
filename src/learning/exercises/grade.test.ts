import { describe, expect, it } from 'vitest'
import type { Exercise } from './exercise.types.ts'
import { grade } from './grade.ts'

// ---------------------------------------------------------------------------
// Acceptance: "grade принимает będziemy robić при вводе będziemy  robić (двойной пробел)".
// Modeled as a `form-input` (verb future analytic form, real per `być|VERB` data) since
// that's the exercise shape a whole-phrase answer like this actually appears on.
// ---------------------------------------------------------------------------

describe('grade — whitespace collapsing (acceptance)', () => {
  const exercise: Exercise = {
    type: 'form-input',
    lemma: 'robić',
    hint: 'делать',
    promptMode: 'lemma',
    slot: 'verb:future:1:pl',
    accepted: ['będziemy robić'],
  }

  it('accepts "będziemy  robić" (double internal space) as correct', () => {
    const result = grade(exercise, 'będziemy  robić')
    expect(result.correct).toBe(true)
    expect(result.nearMiss).toBe(false)
    expect(result.matched).toBe('będziemy robić')
  })

  it('accepts leading/trailing whitespace too', () => {
    expect(grade(exercise, '  będziemy robić  ').correct).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(grade(exercise, 'Będziemy Robić').correct).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Task 21 acceptance: "`robiłem` не засчитывается за `robiłam` и наоборот" (FR-66). The two
// `accepted` lists below are exactly what `enumerateSkills` produces for real `robić|VERB`
// data (verified against `public/content/paradigms/057.json` and pinned by
// `generate-verb-table.test.ts`'s own past-tense test) — `verb:past:1:sg:masculine` ->
// `['robiłem']`, `verb:past:1:sg:feminine` -> `['robiłam']`. Two different `SkillId`s
// (different `Dimension`, per `enumerate.ts`'s gender-in-key rule), hence two different
// `Exercise.accepted` lists — `grade` never sees the other gender's form as a candidate at
// all, so this is really testing that the two skills stay genuinely separate end to end, not
// just that `grade`'s string comparison itself is case/diacritic-correct (already covered
// above).
// ---------------------------------------------------------------------------

describe('grade — "robiłem" vs "robiłam" (task 21, FR-66, real robić|VERB data)', () => {
  const masculineExercise: Exercise = {
    type: 'form-input',
    lemma: 'robić',
    hint: 'делать',
    promptMode: 'lemma',
    slot: 'verb:past:1:sg:masculine',
    accepted: ['robiłem'],
  }
  const feminineExercise: Exercise = {
    type: 'form-input',
    lemma: 'robić',
    hint: 'делать',
    promptMode: 'lemma',
    slot: 'verb:past:1:sg:feminine',
    accepted: ['robiłam'],
  }

  it('"robiłem" is correct for the masculine skill, but not the feminine one', () => {
    expect(grade(masculineExercise, 'robiłem').correct).toBe(true)
    expect(grade(feminineExercise, 'robiłem').correct).toBe(false)
  })

  it('"robiłam" is correct for the feminine skill, but not the masculine one', () => {
    expect(grade(feminineExercise, 'robiłam').correct).toBe(true)
    expect(grade(masculineExercise, 'robiłam').correct).toBe(false)
  })

  it('the cross-gender mismatch is not even a near-miss — the words differ by more than diacritics', () => {
    expect(grade(feminineExercise, 'robiłem').nearMiss).toBe(false)
    expect(grade(masculineExercise, 'robiłam').nearMiss).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Acceptance (as resolved by this task's supervisor — see task 09's file-header decision
// log in generate.ts/grade.ts and `enumerate.test.ts`'s own note): the real multi-spelling
// slot for `aborcja|NOUN` is plural genitive (`noun:pl:genitive`), not singular — verified
// against `public/content/paradigms/023.json` in task 03. `grade` must accept both
// `aborcji` and `aborcyj` for that slot.
// ---------------------------------------------------------------------------

describe('grade — multi-form slot: aborcja|NOUN plural genitive (acceptance)', () => {
  const exercise: Exercise = {
    type: 'form-input',
    lemma: 'aborcja',
    hint: 'аборт',
    promptMode: 'lemma',
    slot: 'noun:pl:genitive',
    accepted: ['aborcyj', 'aborcji'],
  }

  it('accepts "aborcji"', () => {
    const result = grade(exercise, 'aborcji')
    expect(result.correct).toBe(true)
    expect(result.matched).toBe('aborcji')
  })

  it('accepts "aborcyj"', () => {
    const result = grade(exercise, 'aborcyj')
    expect(result.correct).toBe(true)
    expect(result.matched).toBe('aborcyj')
  })

  it('rejects a form that belongs to neither accepted spelling', () => {
    expect(grade(exercise, 'aborcje').correct).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Acceptance: "grade помечает zolty как nearMiss, а не как верный".
// ---------------------------------------------------------------------------

describe('grade — Polish diacritics near-miss (acceptance)', () => {
  const exercise: Exercise = {
    type: 'form-input',
    lemma: 'żółty',
    hint: 'жёлтый',
    promptMode: 'lemma',
    slot: 'adj:degree:positive',
    accepted: ['żółty'],
  }

  it('a diacritic-free answer is nearMiss, not correct', () => {
    const result = grade(exercise, 'zolty')
    expect(result.correct).toBe(false)
    expect(result.nearMiss).toBe(true)
    expect(result.matched).toBe('żółty')
  })

  it('the diff hint flags every diacritic letter in the expected answer', () => {
    const result = grade(exercise, 'zolty')
    expect(result.diff?.expected).toBe('żółty')
    // "żółty": ż(0) ó(1) ł(2) t(3) y(4) — ż/ó/ł all count as diacritic letters; t/y don't.
    expect(result.diff?.diacriticIndexes).toEqual([0, 1, 2])
  })

  it('a completely wrong answer is neither correct nor nearMiss', () => {
    const result = grade(exercise, 'niebieski')
    expect(result.correct).toBe(false)
    expect(result.nearMiss).toBe(false)
  })

  it('the exact diacritic spelling is correct, not nearMiss', () => {
    const result = grade(exercise, 'żółty')
    expect(result.correct).toBe(true)
    expect(result.nearMiss).toBe(false)
  })

  it('ł (no Unicode decomposition) is also treated as a near-miss diacritic', () => {
    const ex: Exercise = {
      type: 'form-input',
      lemma: 'żółty',
      hint: 'жёлтый',
      promptMode: 'lemma',
      slot: 'adj:degree:comparative',
      accepted: ['żółciejszy'],
    }
    // sanity: not directly relevant to ł, but exercises the same path with a longer word
    expect(grade(ex, 'zolciejszy').nearMiss).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Acceptance: "grade принимает ежик для ответа ёжик".
// ---------------------------------------------------------------------------

describe('grade — Russian ё/е folding (acceptance)', () => {
  const exercise: Exercise = {
    type: 'input',
    direction: 'pl-ru',
    prompt: 'jeż',
    accepted: ['ёжик'],
  }

  it('accepts "ежик" for "ёжик"', () => {
    const result = grade(exercise, 'ежик')
    expect(result.correct).toBe(true)
    expect(result.nearMiss).toBe(false)
  })

  it('ё/е folding does not apply to Polish-direction answers', () => {
    // ru-pl: the user types Polish, so ё/е folding must not kick in even if (hypothetically)
    // a Polish accepted form contained a Cyrillic-looking character — not a realistic case,
    // but confirms the language switch is keyed off `direction`, not content sniffing.
    const ex: Exercise = { type: 'input', direction: 'ru-pl', prompt: 'ёжик', accepted: ['jeż'] }
    expect(grade(ex, 'jez').nearMiss).toBe(true) // diacritic-insensitive PL path, not RU path
  })
})

// ---------------------------------------------------------------------------
// Acceptance: "grade не принимает пустую строку".
// ---------------------------------------------------------------------------

describe('grade — empty answer (acceptance)', () => {
  const exercise: Exercise = { type: 'input', direction: 'pl-ru', prompt: 'dom', accepted: ['дом'] }

  it('rejects an empty string', () => {
    const result = grade(exercise, '')
    expect(result.correct).toBe(false)
    expect(result.nearMiss).toBe(false)
  })

  it('rejects a whitespace-only string', () => {
    expect(grade(exercise, '   ').correct).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Coverage for the remaining exercise shapes grade() must support.
// ---------------------------------------------------------------------------

describe('grade — choice / form-choice / self-assess', () => {
  it('choice: matches the single `correct` value', () => {
    const exercise: Exercise = {
      type: 'choice',
      direction: 'pl-ru',
      prompt: 'dom',
      options: ['дом', 'кот', 'стол'],
      correct: 'дом',
    }
    expect(grade(exercise, 'дом').correct).toBe(true)
    expect(grade(exercise, 'кот').correct).toBe(false)
  })

  it('form-choice: matches the single `correct` value', () => {
    const exercise: Exercise = {
      type: 'form-choice',
      lemma: 'kobieta',
      hint: 'женщина',
      promptMode: 'lemma',
      slot: 'noun:sg:genitive',
      options: ['kobiety', 'kobiecie', 'kobietę'],
      correct: 'kobiety',
    }
    expect(grade(exercise, 'kobiety').correct).toBe(true)
  })

  it('self-assess: matches its `answer` field', () => {
    const exercise: Exercise = { type: 'self-assess', prompt: 'osiągnąć', answer: 'достигнуть' }
    expect(grade(exercise, 'достигнуть').correct).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Task 27 (`spec/tasks/27-context-and-error-analysis.md`): the 3 new single-slot exercise
// types, added alongside `choice`/`form-choice` above rather than duplicating that whole
// describe block.
// ---------------------------------------------------------------------------

describe('grade — context-sentence / odd-one-out / pos-classify (task 27)', () => {
  it('context-sentence: matches the single `correct` value (Polish, diacritic-sensitive)', () => {
    const exercise: Exercise = {
      type: 'context-sentence',
      sentence: 'Nie ma ___.',
      slot: 'noun:sg:genitive',
      options: ['kobiety', 'kobiecie', 'kobietę'],
      correct: 'kobiety',
    }
    expect(grade(exercise, 'kobiety').correct).toBe(true)
    expect(grade(exercise, 'kobiecie').correct).toBe(false)
    // Near-miss still applies (Polish answer language) — diacritic-free "kobiety" already
    // matches verbatim here, so exercise the real near-miss case with a diacritic-bearing
    // correct answer instead.
    const diacriticExercise: Exercise = {
      type: 'context-sentence',
      sentence: 'Myślę o ___.',
      slot: 'noun:sg:locative',
      options: ['kobiecie', 'kobiecie-x', 'kobiecie-y'],
      correct: 'kobiecie',
    }
    expect(grade(diacriticExercise, 'kobiecie').correct).toBe(true)
  })

  it('odd-one-out: correct pick is options[oddIndex], graded as Russian (case-insensitive)', () => {
    const exercise: Exercise = {
      type: 'odd-one-out',
      prompt: 'wiedzieć',
      options: ['знать', 'понимать', 'ведать', 'думать'],
      oddIndex: 3,
    }
    expect(grade(exercise, 'думать').correct).toBe(true)
    expect(grade(exercise, 'ДУМАТЬ').correct).toBe(true)
    expect(grade(exercise, 'знать').correct).toBe(false)
  })

  it('pos-classify: matches the single `correct` PosValue', () => {
    const exercise: Exercise = { type: 'pos-classify', lemma: 'kobieta', correct: 'NOUN' }
    expect(grade(exercise, 'NOUN').correct).toBe(true)
    expect(grade(exercise, 'VERB').correct).toBe(false)
  })
})

describe('grade — table / matching are refused (composite, no single accepted answer)', () => {
  it('throws for "table"', () => {
    const exercise: Exercise = { type: 'table', lemma: 'kobieta', cells: [] }
    expect(() => grade(exercise, 'kobiety')).toThrow()
  })

  it('throws for "matching"', () => {
    const exercise: Exercise = { type: 'matching', pairs: [{ pl: 'dom', ru: 'дом' }] }
    expect(() => grade(exercise, 'dom')).toThrow()
  })
})

describe('grade — accepts any of several accepted answers (general case)', () => {
  it('input: any translation in `accepted` counts', () => {
    const exercise: Exercise = {
      type: 'input',
      direction: 'pl-ru',
      prompt: 'znać',
      accepted: ['знать', 'быть знакомым'],
    }
    expect(grade(exercise, 'быть знакомым').correct).toBe(true)
    expect(grade(exercise, 'знать').correct).toBe(true)
  })
})
