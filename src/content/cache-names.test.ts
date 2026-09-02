import { describe, expect, it } from 'vitest'
import { paradigmCacheName, sensesCacheName } from './cache-names.ts'

describe('cache-names', () => {
  it('paradigmCacheName is "paradigms-<contentVersion>"', () => {
    expect(paradigmCacheName('a1b2c3d4e5f6')).toBe('paradigms-a1b2c3d4e5f6')
  })

  it('sensesCacheName is "senses-<contentVersion>"', () => {
    expect(sensesCacheName('a1b2c3d4e5f6')).toBe('senses-a1b2c3d4e5f6')
  })

  it('the two names never collide for the same contentVersion', () => {
    const version = 'x'
    expect(paradigmCacheName(version)).not.toBe(sensesCacheName(version))
  })
})
