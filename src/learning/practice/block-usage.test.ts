import { describe, expect, it } from 'vitest'
import {
  USAGE_HALF_LIFE_MS,
  decayedScore,
  orderBlocks,
  recordBlockRun,
  type BlockUsage,
  type BlockUsageMap,
} from './block-usage.ts'

const DAY_MS = 24 * 60 * 60 * 1000

function usage(score: number, updatedAt: number, runs = 1): BlockUsage {
  return { score, updatedAt, runs }
}

describe('decayedScore', () => {
  it('returns 0 for a block that was never run', () => {
    expect(decayedScore(undefined, Date.now())).toBe(0)
  })

  it('returns the raw score when queried at the exact updatedAt instant', () => {
    expect(decayedScore(usage(10, 1000), 1000)).toBe(10)
  })

  it('halves the score after exactly one half-life', () => {
    const at = 5000
    const score = decayedScore(usage(10, at - USAGE_HALF_LIFE_MS), at)
    expect(score).toBeCloseTo(5, 10)
  })

  // The task requirement, quoted literally: "сто раз месяц назад, десять раз сейчас должно
  // дать преимущество новому блоку" — a hundred runs a month ago must lose to ten runs today.
  it('100 runs 30 days ago score below 10 runs today', () => {
    const now = Date.now()
    const oldHeavy = decayedScore(usage(100, now - 30 * DAY_MS), now)
    const newLight = decayedScore(usage(10, now), now)
    expect(oldHeavy).toBeLessThan(newLight)
  })
})

describe('recordBlockRun', () => {
  it('starts a fresh entry at score 1, runs 1', () => {
    const at = 1000
    const next = recordBlockRun({}, 'vocab-choice', at)
    expect(next['vocab-choice']).toEqual({ score: 1, updatedAt: at, runs: 1 })
  })

  it('decays the previous score before adding 1, and increments runs', () => {
    const at = USAGE_HALF_LIFE_MS
    const map: BlockUsageMap = { forms: usage(10, 0, 3) }
    const next = recordBlockRun(map, 'forms', at)
    expect(next.forms!.score).toBeCloseTo(6, 10) // 10 * 0.5 + 1
    expect(next.forms!.runs).toBe(4)
    expect(next.forms!.updatedAt).toBe(at)
  })

  it('does not modify other blocks in the map', () => {
    const map: BlockUsageMap = {
      matching: usage(5, 0),
      forms: usage(2, 0),
    }
    const next = recordBlockRun(map, 'matching', 100)
    expect(next.forms).toEqual(map.forms)
  })
})

describe('orderBlocks', () => {
  const defaultOrder = ['vocab-choice', 'vocab-spelling', 'matching', 'forms']

  it('returns defaultOrder unchanged for an empty usage map', () => {
    expect(orderBlocks(defaultOrder, {}, Date.now())).toEqual(defaultOrder)
  })

  it('sorts by descending decayed score', () => {
    const at = 1000
    const map: BlockUsageMap = {
      'vocab-choice': usage(1, at),
      forms: usage(50, at),
      matching: usage(10, at),
    }
    expect(orderBlocks(defaultOrder, map, at)).toEqual([
      'forms',
      'matching',
      'vocab-choice',
      'vocab-spelling',
    ])
  })

  it('keeps defaultOrder among ties, including the all-zero case, on repeated calls', () => {
    const map: BlockUsageMap = {
      'vocab-choice': usage(5, 1000),
      'vocab-spelling': usage(5, 1000),
    }
    const first = orderBlocks(defaultOrder, map, 2000)
    const second = orderBlocks(defaultOrder, map, 2000)
    expect(first).toEqual(second)
    expect(first.indexOf('vocab-choice')).toBeLessThan(first.indexOf('vocab-spelling'))
  })

  it('ignores ids in the map that are absent from defaultOrder', () => {
    const map: BlockUsageMap = {
      'some-removed-block': usage(1000, 1000),
      forms: usage(1, 1000),
    }
    const result = orderBlocks(defaultOrder, map, 1000)
    expect(result).toHaveLength(defaultOrder.length)
    expect(result).not.toContain('some-removed-block')
    expect(new Set(result)).toEqual(new Set(defaultOrder))
  })

  it('the literal 100-runs-a-month-ago-vs-10-runs-today example changes the winner', () => {
    const now = Date.now()
    const map: BlockUsageMap = {
      'vocab-choice': usage(100, now - 30 * DAY_MS, 100),
      matching: usage(10, now, 10),
    }
    const result = orderBlocks(defaultOrder, map, now)
    expect(result.indexOf('matching')).toBeLessThan(result.indexOf('vocab-choice'))
  })
})
