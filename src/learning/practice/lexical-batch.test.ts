import { describe, expect, it } from 'vitest'
import { sampleWordBatch, shouldGradeMatch } from './lexical-batch.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'

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
  const A = encodeWordId('kobieta', 'NOUN')
  const B = encodeWordId('dom', 'NOUN')

  it('grades a word that took no part in a wrong pairing', () => {
    expect(shouldGradeMatch(A, new Set())).toBe(true)
    // Запятнано другое слово — это слово по-прежнему засчитывается.
    expect(shouldGradeMatch(A, new Set([B]))).toBe(true)
  })

  it('does not grade a tainted word', () => {
    expect(shouldGradeMatch(A, new Set([A]))).toBe(false)
    expect(shouldGradeMatch(B, new Set([A, B]))).toBe(false)
  })
})
