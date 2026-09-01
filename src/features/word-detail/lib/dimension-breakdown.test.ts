/**
 * `buildDimensionBreakdown` unit tests (`spec/tasks/08-word-detail.md` §4, FR-47).
 *
 * Descriptors are built by hand (not through `enumerateSkills` + a real paradigm) — this
 * module only groups/labels whatever `SkillDescriptor[]` it's handed, so a hand-built list
 * covering each POS's dimension shapes exercises exactly the code under test without
 * dragging in content-loading concerns `enumerate.test.ts` already covers.
 */
import { describe, expect, it } from 'vitest'
import { buildDimensionBreakdown } from './dimension-breakdown.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type { SkillKind, SkillRecord } from '@/types/progress.ts'

const WORD_ID: WordId = 'test|NOUN'

function descriptor(dimension: string, kind: SkillKind): SkillDescriptor {
  return {
    skillId: `${WORD_ID}::${dimension}`,
    wordId: WORD_ID,
    kind,
    dimension: dimension as SkillDescriptor['dimension'],
    acceptedAnswers: [],
  }
}

function skill(skillId: SkillId, stabilityDays: number): SkillRecord {
  return {
    skillId,
    wordId: WORD_ID,
    kind: 'noun',
    dimension: skillId.split('::')[1] ?? '',
    state: 'review',
    stability: stabilityDays,
    difficulty: 3,
    due: 0,
    reps: 1,
    lapses: 0,
    correct: 1,
    incorrect: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('buildDimensionBreakdown — NOUN', () => {
  const descriptors: SkillDescriptor[] = [
    descriptor('vocab:pl-ru', 'vocab'),
    descriptor('vocab:ru-pl', 'vocab'),
    descriptor('noun:sg:nominative', 'noun'),
    descriptor('noun:pl:nominative', 'noun'),
    descriptor('noun:sg:genitive', 'noun'),
  ]

  it('groups by case and by number, empty known -> everything 0', () => {
    const groups = buildDimensionBreakdown('NOUN', descriptors, new Map())
    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]))

    expect(byTitle['По падежам']).toBeDefined()
    const caseKeys = byTitle['По падежам']!.rows.map((r) => r.key)
    // nominative and genitive have descriptors; the other 5 cases don't -> absent, not zero.
    expect(caseKeys).toEqual(['nominative', 'genitive'])
    expect(byTitle['По падежам']!.rows.every((r) => r.value === 0)).toBe(true)

    expect(byTitle['По числу']).toBeDefined()
    // Keys are the `sg`/`pl` abbreviation `byNumberKey` groups by, not the expanded word.
    expect(byTitle['По числу']!.rows.map((r) => r.key)).toEqual(['sg', 'pl'])

    // NOUN never gets a gender or degree group.
    expect(byTitle['По родам']).toBeUndefined()
    expect(byTitle['Степени сравнения']).toBeUndefined()
  })

  it('a materialized skill raises exactly its own case (sg+pl pooled) and number group', () => {
    const known = new Map<SkillId, SkillRecord>([
      [`${WORD_ID}::noun:sg:nominative`, skill(`${WORD_ID}::noun:sg:nominative`, 60)],
    ])
    const groups = buildDimensionBreakdown('NOUN', descriptors, known)
    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]))

    const nominativeRow = byTitle['По падежам']!.rows.find((r) => r.key === 'nominative')
    // byCaseKey pools noun:sg:nominative (mature, stability 60 -> maturity 1) with
    // noun:pl:nominative (no record -> 0) -> averages to 0.5, same sg+pl pooling as
    // `aggregate.ts`'s own `byCaseKey` doc comment describes.
    expect(nominativeRow?.value).toBe(0.5)

    const genitiveRow = byTitle['По падежам']!.rows.find((r) => r.key === 'genitive')
    expect(genitiveRow?.value).toBe(0)

    const singularRow = byTitle['По числу']!.rows.find((r) => r.key === 'sg')
    // singular pools noun:sg:nominative (mature) with noun:sg:genitive (new) -> averages to 0.5.
    expect(singularRow?.value).toBe(0.5)
  })

  it('no morphology descriptors at all (paradigm-less word) -> no groups', () => {
    const vocabOnly = descriptors.slice(0, 2)
    expect(buildDimensionBreakdown('NOUN', vocabOnly, new Map())).toEqual([])
  })
})

describe('buildDimensionBreakdown — VERB', () => {
  const descriptors: SkillDescriptor[] = [
    descriptor('vocab:pl-ru', 'vocab'),
    descriptor('vocab:ru-pl', 'vocab'),
    descriptor('verb:present:1:sg', 'verb'),
    descriptor('verb:future:1:sg', 'verb'),
    descriptor('verb:imperative:2:sg', 'verb'),
    descriptor('verb:past:1:sg:masculine', 'verb'),
    descriptor('verb:past:1:sg:feminine', 'verb'),
  ]

  it('one tense/mood group includes present, past, future (canonical order) AND imperative appended', () => {
    const groups = buildDimensionBreakdown('VERB', descriptors, new Map())
    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]))
    const keys = byTitle['По временам и наклонению']!.rows.map((r) => r.key)
    // `past` legitimately appears here too (pooled across all its gender variants) — this is
    // the same "same skills grouped along two independent axes" pattern as NOUN's case/number
    // split; the *separate* by-gender breakdown of past is its own group, tested below.
    expect(keys).toEqual(['present', 'past', 'future', 'imperative'])
  })

  it('a separate group breaks past tense down by gender', () => {
    const groups = buildDimensionBreakdown('VERB', descriptors, new Map())
    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]))
    const keys = byTitle['Прошедшее время по родам']!.rows.map((r) => r.key)
    expect(keys).toEqual(['masculine', 'feminine'])
  })
})

describe('buildDimensionBreakdown — ADJ', () => {
  const descriptors: SkillDescriptor[] = [
    descriptor('vocab:pl-ru', 'vocab'),
    descriptor('vocab:ru-pl', 'vocab'),
    descriptor('adj:sg:masculine_personal:nominative', 'adj'),
    descriptor('adj:pl:feminine:genitive', 'adj'),
    descriptor('adj:degree:comparative', 'adj'),
    descriptor('adj:degree:superlative', 'adj'),
  ]

  it('produces case, number, gender and degree groups', () => {
    const groups = buildDimensionBreakdown('ADJ', descriptors, new Map())
    const titles = groups.map((g) => g.title)
    expect(titles).toEqual(['По падежам', 'По числу', 'По родам', 'Степени сравнения'])
    const byTitleForNumber = Object.fromEntries(groups.map((g) => [g.title, g]))
    expect(byTitleForNumber['По числу']!.rows.map((r) => r.key)).toEqual(['sg', 'pl'])

    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]))
    expect(byTitle['Степени сравнения']!.rows.map((r) => r.key)).toEqual([
      'comparative',
      'superlative',
    ])
  })
})

describe('buildDimensionBreakdown — ADV', () => {
  it('only a degree group, nothing else', () => {
    const descriptors: SkillDescriptor[] = [
      descriptor('vocab:pl-ru', 'vocab'),
      descriptor('vocab:ru-pl', 'vocab'),
      descriptor('adv:degree:comparative', 'adv'),
    ]
    const groups = buildDimensionBreakdown('ADV', descriptors, new Map())
    expect(groups).toHaveLength(1)
    expect(groups[0]!.title).toBe('Степени сравнения')
    expect(groups[0]!.rows.map((r) => r.key)).toEqual(['comparative'])
  })
})
