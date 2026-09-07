import { describe, expect, it } from 'vitest'
import {
  MATCHING_UNGRADED_TAIL,
  sampleWordBatch,
  shouldGradeMatch,
} from './lexical-batch.ts'

describe('sampleWordBatch', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('is deterministic for a given seed', () => {
    expect(sampleWordBatch(items, 3, 42)).toEqual(sampleWordBatch(items, 3, 42))
  })

  it('returns a different order for a different seed (overwhelmingly likely)', () => {
    expect(sampleWordBatch(items, items.length, 1)).not.toEqual(
      sampleWordBatch(items, items.length, 2),
    )
  })

  it('returns every item, shuffled, when n exceeds the pool size', () => {
    const result = sampleWordBatch(items, 100, 7)
    expect(result).toHaveLength(items.length)
    expect(new Set(result)).toEqual(new Set(items))
  })

  it('returns an empty array for n <= 0', () => {
    expect(sampleWordBatch(items, 0, 1)).toEqual([])
    expect(sampleWordBatch(items, -5, 1)).toEqual([])
  })

  it('never repeats an item within one batch', () => {
    const result = sampleWordBatch(items, 5, 99)
    expect(new Set(result).size).toBe(result.length)
  })
})

describe('shouldGradeMatch', () => {
  it('grades every pairing except the last MATCHING_UNGRADED_TAIL of a normal 5-pair batch', () => {
    const total = 5
    expect(shouldGradeMatch(0, total)).toBe(true)
    expect(shouldGradeMatch(1, total)).toBe(true)
    expect(shouldGradeMatch(2, total)).toBe(true)
    expect(shouldGradeMatch(3, total)).toBe(false)
    expect(shouldGradeMatch(4, total)).toBe(false)
  })

  it('grades nothing in a batch no larger than MATCHING_UNGRADED_TAIL', () => {
    expect(shouldGradeMatch(0, MATCHING_UNGRADED_TAIL)).toBe(false)
    expect(shouldGradeMatch(0, 1)).toBe(false)
    expect(shouldGradeMatch(0, 2)).toBe(false)
  })

  it('grades everything up to (but not including) the tail in a larger batch', () => {
    const total = 10
    expect(shouldGradeMatch(7, total)).toBe(true)
    expect(shouldGradeMatch(8, total)).toBe(false)
    expect(shouldGradeMatch(9, total)).toBe(false)
  })
})
