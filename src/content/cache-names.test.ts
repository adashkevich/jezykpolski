import { describe, expect, it } from 'vitest'
import { paradigmCacheName, senseDetailsCacheName, sensesCacheName } from './cache-names.ts'

describe('cache-names', () => {
  it('paradigmCacheName is "paradigms-<contentVersion>"', () => {
    expect(paradigmCacheName('a1b2c3d4e5f6')).toBe('paradigms-a1b2c3d4e5f6')
  })

  it('sensesCacheName is "senses-<contentVersion>"', () => {
    expect(sensesCacheName('a1b2c3d4e5f6')).toBe('senses-a1b2c3d4e5f6')
  })

  it('senseDetailsCacheName is "sense-details-<contentVersion>"', () => {
    expect(senseDetailsCacheName('a1b2c3d4e5f6')).toBe('sense-details-a1b2c3d4e5f6')
  })

  it('the names never collide for the same contentVersion', () => {
    const version = 'x'
    const names = [
      paradigmCacheName(version),
      sensesCacheName(version),
      senseDetailsCacheName(version),
    ]
    expect(new Set(names).size).toBe(3)
  })
})
