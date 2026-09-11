/**
 * `quick-return` tests — the `/words` filter chrome's scroll-following and snap math.
 */
import { describe, expect, it } from 'vitest'
import { followScroll, snapTarget } from './quick-return.ts'

const H = 200

describe('followScroll', () => {
  it('tucks the chrome away 1:1 with a downward scroll', () => {
    expect(followScroll(0, 30, 1000, H)).toBe(30)
  })

  it('pulls it back out 1:1 with an upward scroll', () => {
    expect(followScroll(H, -50, 1000, H)).toBe(150)
  })

  it('clamps to [0, height]', () => {
    expect(followScroll(190, 40, 1000, H)).toBe(H)
    expect(followScroll(10, -40, 1000, H)).toBe(0)
  })

  it('never tucks further than the list is scrolled (stays glued near the top)', () => {
    expect(followScroll(0, 80, 60, H)).toBe(60)
    expect(followScroll(150, -100, 40, H)).toBe(40)
  })

  it('treats rubber-band negative scrollTop as the top', () => {
    expect(followScroll(0, -20, -20, H)).toBe(0)
  })
})

describe('snapTarget', () => {
  it('does nothing when fully shown or fully hidden', () => {
    expect(snapTarget(0, 1000, H)).toEqual({ kind: 'none' })
    expect(snapTarget(H, 1000, H)).toEqual({ kind: 'none' })
  })

  it('opens when less than half is tucked away', () => {
    expect(snapTarget(99, 1000, H)).toEqual({ kind: 'offset', to: 0 })
  })

  it('hides when at least half is tucked away', () => {
    expect(snapTarget(100, 1000, H)).toEqual({ kind: 'offset', to: H })
  })

  it('scrolls the content instead of uncovering the band above row 0', () => {
    expect(snapTarget(150, 150, H)).toEqual({ kind: 'scroll', to: H })
  })

  it('does nothing before the chrome has been measured', () => {
    expect(snapTarget(10, 1000, 0)).toEqual({ kind: 'none' })
  })
})
