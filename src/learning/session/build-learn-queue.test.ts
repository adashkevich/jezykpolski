import { describe, expect, it } from 'vitest'
import type { SkillRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { buildLearnQueue, collapseVocabStages } from './build-learn-queue.ts'

function skill(
  overrides: Partial<SkillRecord> & Pick<SkillRecord, 'skillId' | 'due'>,
): SkillRecord {
  return {
    wordId: overrides.skillId.split('::')[0]!,
    kind: 'vocab',
    dimension: 'vocab:pl-ru',
    state: 'review',
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function word(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'rank'>,
): WordIndexEntry {
  return {
    pos: 'NOUN',
    level: 'A1',
    primaryRu: `${overrides.lemma}-ru`,
    sensesShard: 0,
    paradigmShard: 0,
    ...overrides,
  }
}

describe('buildLearnQueue', () => {
  it('orders overdue reviews oldest-due-first, ahead of learning/relearning', () => {
    const oldReview = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100, state: 'review' })
    const newerReview = skill({ skillId: 'b|NOUN::vocab:pl-ru', due: 200, state: 'review' })
    const learning = skill({ skillId: 'c|NOUN::vocab:pl-ru', due: 50, state: 'learning' })

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [learning, newerReview, oldReview],
      newWordsBudget: 0,
      candidateNewWords: [],
      targetSize: 20,
    })

    expect(plan.items.map((i) => (i.source === 'due' ? i.skill.skillId : i.wordId))).toEqual([
      'a|NOUN::vocab:pl-ru', // oldest review due
      'b|NOUN::vocab:pl-ru', // newer review due
      'c|NOUN::vocab:pl-ru', // learning/relearning tier, after all reviews
    ])
  })

  it('newWordsBudget = 0 yields a reviews-only queue', () => {
    const review = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100 })
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [review],
      newWordsBudget: 0,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1 })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ source: 'due' })
  })

  it('an empty due list and empty candidates yields an empty plan', () => {
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 10,
      candidateNewWords: [],
      targetSize: 20,
    })
    expect(plan.items).toEqual([])
  })

  it('takes new words in the order the caller already sorted them, capped at newWordsBudget', () => {
    // Task 35: `buildLearnQueue` no longer sorts `candidateNewWords` itself — the caller
    // (`session-scope.ts#resolveGlobalScope`, via `level-gate.ts#orderNewWordCandidates`)
    // is responsible for ordering, so this fixture is handed in already sorted by rank.
    const words = [
      word({ lemma: 'a', rank: 10 }),
      word({ lemma: 'b', rank: 20 }),
      word({ lemma: 'c', rank: 30 }),
    ]
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 2,
      candidateNewWords: words,
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(2)
    const lemmas = plan.items.map((i) => (i.source === 'new' ? i.word.lemma : null))
    expect(lemmas).toEqual(['a', 'b'])
  })

  it('does not re-sort candidateNewWords — takes them in caller order even if that is not rank-ascending', () => {
    const words = [
      word({ lemma: 'c', rank: 30 }),
      word({ lemma: 'a', rank: 10 }),
      word({ lemma: 'b', rank: 20 }),
    ]
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 2,
      candidateNewWords: words,
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(2)
    const lemmas = plan.items.map((i) => (i.source === 'new' ? i.word.lemma : null))
    expect(lemmas).toEqual(['c', 'a'])
  })

  it('creates only a vocab:pl-ru-shaped item for new words (the union carries no skill yet)', () => {
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [],
      newWordsBudget: 1,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1, pos: 'NOUN' })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(1)
    const item = plan.items[0]!
    expect(item.source).toBe('new')
    if (item.source === 'new') {
      expect(item.wordId).toBe('nowy|NOUN')
      // No SkillRecord at all is carried — ensureSkill('vocab:pl-ru') is the caller's job,
      // done lazily once this item is actually about to be shown (see session.types.ts).
      expect('skill' in item).toBe(false)
    }
  })

  it('interleaves new words across the queue instead of appending them as a trailing block', () => {
    const dueSkills = Array.from({ length: 15 }, (_, i) =>
      skill({ skillId: `w${i}|NOUN::vocab:pl-ru`, due: i }),
    )
    const newWords = Array.from({ length: 5 }, (_, i) => word({ lemma: `n${i}`, rank: i }))

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills,
      newWordsBudget: 5,
      candidateNewWords: newWords,
      targetSize: 20,
    })

    expect(plan.items).toHaveLength(20)
    const newPositions = plan.items
      .map((item, index) => (item.source === 'new' ? index : -1))
      .filter((index) => index !== -1)

    expect(newPositions).toHaveLength(5)
    // Not bunched at the very end: the last item must be a review, not a new word — a
    // trailing block of 5 new words would put a 'new' item at index 19.
    expect(plan.items[19]!.source).toBe('due')
    // Not bunched at the very start either — the first item is always a review when any
    // exist (task text: overdue reviews come before new words).
    expect(plan.items[0]!.source).toBe('due')
    // Spread out, not clumped together: consecutive new-word positions should be several
    // apart (roughly every 3rd slot for 15 reviews / 5 new words).
    for (let i = 1; i < newPositions.length; i++) {
      expect(newPositions[i]! - newPositions[i - 1]!).toBeGreaterThanOrEqual(2)
    }
  })

  it('caps the total at targetSize, letting a review backlog crowd out new words entirely', () => {
    const dueSkills = Array.from({ length: 25 }, (_, i) =>
      skill({ skillId: `w${i}|NOUN::vocab:pl-ru`, due: i }),
    )
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills,
      newWordsBudget: 10,
      candidateNewWords: [word({ lemma: 'nowy', rank: 1 })],
      targetSize: 20,
    })
    expect(plan.items).toHaveLength(20)
    expect(plan.items.every((item) => item.source === 'due')).toBe(true)
    // The 20 kept are the 20 most overdue (smallest `due`), not an arbitrary slice.
    const dues = plan.items.map((item) => (item.source === 'due' ? item.skill.due : -1))
    expect(dues).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })
})

// ---------------------------------------------------------------------------
// collapseVocabStages (task 40 §2, "один вопрос на слово за сессию").
// ---------------------------------------------------------------------------

describe('collapseVocabStages', () => {
  it('keeps only the earliest-due vocab stage of a word with several due at once', () => {
    const plRu = skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due: 200 })
    const ruPlChoice = skill({
      skillId: 'a|NOUN::vocab:ru-pl-choice',
      dimension: 'vocab:ru-pl-choice',
      due: 100,
    })
    expect(collapseVocabStages([plRu, ruPlChoice])).toEqual([ruPlChoice])
  })

  it('at equal due, the more advanced stage wins', () => {
    const plRu = skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due: 100 })
    const ruPlChoice = skill({
      skillId: 'a|NOUN::vocab:ru-pl-choice',
      dimension: 'vocab:ru-pl-choice',
      due: 100,
    })
    expect(collapseVocabStages([plRu, ruPlChoice])).toEqual([ruPlChoice])
  })

  it('collapses all three stages of one word down to one', () => {
    const plRu = skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due: 300 })
    const ruPlChoice = skill({
      skillId: 'a|NOUN::vocab:ru-pl-choice',
      dimension: 'vocab:ru-pl-choice',
      due: 200,
    })
    const ruPlInput = skill({
      skillId: 'a|NOUN::vocab:ru-pl-input',
      dimension: 'vocab:ru-pl-input',
      due: 100,
    })
    expect(collapseVocabStages([plRu, ruPlChoice, ruPlInput])).toEqual([ruPlInput])
  })

  it('never collapses across different words', () => {
    const a = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100 })
    const b = skill({ skillId: 'b|NOUN::vocab:pl-ru', due: 200 })
    const result = collapseVocabStages([a, b])
    expect(result).toHaveLength(2)
    expect(result).toEqual(expect.arrayContaining([a, b]))
  })

  it('leaves morphological skills of the same word untouched, even alongside a due vocab skill', () => {
    const vocab = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100 })
    const genitive = skill({
      skillId: 'a|NOUN::noun:sg:genitive',
      wordId: 'a|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:genitive',
      due: 150,
    })
    const dative = skill({
      skillId: 'a|NOUN::noun:sg:dative',
      wordId: 'a|NOUN',
      kind: 'noun',
      dimension: 'noun:sg:dative',
      due: 175,
    })
    const result = collapseVocabStages([vocab, genitive, dative])
    expect(result).toHaveLength(3)
    expect(result).toEqual(expect.arrayContaining([vocab, genitive, dative]))
  })

  it('is a no-op when every word has at most one due vocab stage', () => {
    const a = skill({ skillId: 'a|NOUN::vocab:pl-ru', due: 100 })
    const b = skill({ skillId: 'b|NOUN::vocab:ru-pl-choice', dimension: 'vocab:ru-pl-choice', due: 200 })
    expect(collapseVocabStages([a, b])).toEqual([a, b])
  })
})

describe('buildLearnQueue — one question per word per session (task 40 §2)', () => {
  it('a word with two vocab stages due at once only ever contributes one queue item', () => {
    const plRu = skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due: 200 })
    const ruPlChoice = skill({
      skillId: 'a|NOUN::vocab:ru-pl-choice',
      dimension: 'vocab:ru-pl-choice',
      due: 100,
    })
    const otherWord = skill({ skillId: 'b|NOUN::vocab:pl-ru', due: 150 })

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [plRu, ruPlChoice, otherWord],
      newWordsBudget: 0,
      candidateNewWords: [],
      targetSize: 20,
    })

    const skillIds = plan.items.map((i) => (i.source === 'due' ? i.skill.skillId : i.wordId))
    expect(skillIds).toEqual(['a|NOUN::vocab:ru-pl-choice', 'b|NOUN::vocab:pl-ru'])
  })
})

// ---------------------------------------------------------------------------
// Task 43 §2: `vocab:ru-pl-input` с `awaitingRecognition` не участвует в очереди.
// ---------------------------------------------------------------------------

describe('collapseVocabStages — блокировка ввода после «Показать слово» (task 43 §2)', () => {
  const plRu = (due: number) =>
    skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due })
  const choice = (due: number) =>
    skill({ skillId: 'a|NOUN::vocab:ru-pl-choice', dimension: 'vocab:ru-pl-choice', due })
  const lockedInput = (due: number) =>
    skill({
      skillId: 'a|NOUN::vocab:ru-pl-input',
      dimension: 'vocab:ru-pl-input',
      due,
      awaitingRecognition: true,
    })

  it('заблокированный ввод исключается, даже самый просроченный: слово приходит вопросом ru-pl-choice', () => {
    expect(collapseVocabStages([plRu(200), choice(200), lockedInput(50)])).toEqual([choice(200)])
  })

  it('при равном due из оставшихся побеждает старший этап — ru-pl-choice, а не pl-ru', () => {
    expect(collapseVocabStages([lockedInput(100), plRu(100), choice(100)])).toEqual([choice(100)])
  })

  it('если у слова больше нет других просроченных этапов, оно из очереди уходит целиком', () => {
    expect(collapseVocabStages([lockedInput(100)])).toEqual([])
  })

  it('заблокированный ввод одного слова не влияет на другое слово', () => {
    const other = skill({ skillId: 'b|NOUN::vocab:ru-pl-input', dimension: 'vocab:ru-pl-input', due: 10 })
    expect(collapseVocabStages([lockedInput(1), choice(5), other])).toEqual(
      expect.arrayContaining([choice(5), other]),
    )
    expect(collapseVocabStages([lockedInput(1), choice(5), other])).toHaveLength(2)
  })

  it('ввод без флага ведёт себя как раньше (побеждает по due / по старшинству)', () => {
    const openInput = skill({
      skillId: 'a|NOUN::vocab:ru-pl-input',
      dimension: 'vocab:ru-pl-input',
      due: 100,
    })
    expect(collapseVocabStages([plRu(200), choice(150), openInput])).toEqual([openInput])
  })
})

describe('buildLearnQueue — блокировка ввода (task 43 §2)', () => {
  it('просроченный vocab:ru-pl-input с awaitingRecognition не выдаётся; слово приходит ru-pl-choice', () => {
    const lockedInput = skill({
      skillId: 'a|NOUN::vocab:ru-pl-input',
      dimension: 'vocab:ru-pl-input',
      due: 10,
      awaitingRecognition: true,
    })
    const choice = skill({
      skillId: 'a|NOUN::vocab:ru-pl-choice',
      dimension: 'vocab:ru-pl-choice',
      due: 500,
    })
    const plRu = skill({ skillId: 'a|NOUN::vocab:pl-ru', dimension: 'vocab:pl-ru', due: 500 })

    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [lockedInput, plRu, choice],
      newWordsBudget: 0,
      candidateNewWords: [],
      targetSize: 20,
    })

    expect(plan.items.map((i) => (i.source === 'due' ? i.skill.skillId : i.wordId))).toEqual([
      'a|NOUN::vocab:ru-pl-choice',
    ])
  })

  it('после снятия флага тот же ввод снова попадает в очередь', () => {
    const openInput = skill({
      skillId: 'a|NOUN::vocab:ru-pl-input',
      dimension: 'vocab:ru-pl-input',
      due: 10,
    })
    const plan = buildLearnQueue({
      now: 1000,
      dueSkills: [openInput],
      newWordsBudget: 0,
      candidateNewWords: [],
      targetSize: 20,
    })
    expect(plan.items.map((i) => (i.source === 'due' ? i.skill.skillId : i.wordId))).toEqual([
      'a|NOUN::vocab:ru-pl-input',
    ])
  })
})
