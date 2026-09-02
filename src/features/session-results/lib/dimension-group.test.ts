/**
 * `dimension-group.ts` (`spec/tasks/14-session-results.md` §1's "Сложнее всего" grouping).
 */
import { describe, expect, it } from 'vitest'
import { dimensionGroup } from './dimension-group.ts'

describe('dimensionGroup', () => {
  it('collapses noun case dimensions to a bare case key/label, ignoring number', () => {
    const sg = dimensionGroup('noun:sg:genitive')
    const pl = dimensionGroup('noun:pl:genitive')
    expect(sg.key).toBe('case:genitive')
    expect(pl.key).toBe('case:genitive')
    expect(sg.label).toEqual({ pl: 'Dopełniacz', ru: 'Родительный' })
    expect(sg.label).toEqual(pl.label)
  })

  it('collapses adj case dimensions to the same case key as noun, ignoring number/gender', () => {
    const nounLocative = dimensionGroup('noun:sg:locative')
    const adjLocative = dimensionGroup('adj:pl:feminine:locative')
    expect(adjLocative.key).toBe('case:locative')
    expect(adjLocative.key).toBe(nounLocative.key)
    expect(adjLocative.label).toEqual({ pl: 'Miejscownik', ru: 'Предложный' })
  })

  it('groups adj degree dimensions separately from adj case dimensions', () => {
    const degree = dimensionGroup('adj:degree:comparative')
    expect(degree.key).toBe('degree:comparative')
    expect(degree.label).toEqual({ pl: 'Stopień wyższy', ru: 'Сравнительная степень' })
  })

  it('adv degree dimensions share the same key namespace as adj degree', () => {
    const adjDegree = dimensionGroup('adj:degree:superlative')
    const advDegree = dimensionGroup('adv:degree:superlative')
    expect(advDegree.key).toBe(adjDegree.key)
  })

  it('groups verb tense dimensions (present/future/past) by tense, ignoring person/number/gender', () => {
    const present1 = dimensionGroup('verb:present:1:sg')
    const present2 = dimensionGroup('verb:present:3:pl')
    const past = dimensionGroup('verb:past:3:sg:masculine')
    expect(present1.key).toBe('tense:present')
    expect(present2.key).toBe('tense:present')
    expect(past.key).toBe('tense:past')
    expect(present1.label).toEqual({ pl: 'Czas teraźniejszy', ru: 'Настоящее время' })
  })

  it('groups verb imperative dimensions under a dedicated mood key, not a tense', () => {
    const imperative = dimensionGroup('verb:imperative:2:sg')
    expect(imperative.key).toBe('mood:imperative')
    expect(imperative.label.ru).toContain('Повелительн')
  })

  it('keeps the two vocab directions as two distinct groups', () => {
    const plRu = dimensionGroup('vocab:pl-ru')
    const ruPl = dimensionGroup('vocab:ru-pl')
    expect(plRu.key).not.toBe(ruPl.key)
    expect(plRu.label.ru).toContain('PL')
    expect(ruPl.label.ru).toContain('RU')
  })
})
