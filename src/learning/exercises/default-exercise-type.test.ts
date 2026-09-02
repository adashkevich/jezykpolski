import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXERCISE_TYPES_DEFAULT,
  resolveForceCategory,
} from './default-exercise-type.ts'

describe('resolveForceCategory', () => {
  it('both checked -> no restriction (the default)', () => {
    expect(resolveForceCategory({ choice: true, input: true })).toBeUndefined()
    expect(resolveForceCategory(DEFAULT_EXERCISE_TYPES_DEFAULT)).toBeUndefined()
  })

  it('only choice checked -> recognition', () => {
    expect(resolveForceCategory({ choice: true, input: false })).toBe('recognition')
  })

  it('only input checked -> recall', () => {
    expect(resolveForceCategory({ choice: false, input: true })).toBe('recall')
  })

  it('neither checked (defensive) -> no restriction', () => {
    expect(resolveForceCategory({ choice: false, input: false })).toBeUndefined()
  })
})
