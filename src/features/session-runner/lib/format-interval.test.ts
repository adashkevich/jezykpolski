import { describe, expect, it } from 'vitest'
import { formatInterval } from './format-interval.ts'

describe('formatInterval', () => {
  it('formats sub-hour intervals in minutes, floored at 1', () => {
    expect(formatInterval(10 * 60 * 1000)).toBe('10 мин')
    expect(formatInterval(30 * 1000)).toBe('1 мин')
  })

  it('formats sub-day intervals in hours', () => {
    expect(formatInterval(5 * 60 * 60 * 1000)).toBe('5 ч')
  })

  it('formats intervals of a day or more in days', () => {
    expect(formatInterval(3 * 24 * 60 * 60 * 1000)).toBe('3 дн')
  })
})
