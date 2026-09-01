import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import { get, remove, set } from './settings.repository.ts'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('settings.repository', () => {
  it('get returns the fallback when the key has never been set', async () => {
    expect(await get('theme', 'system')).toBe('system')
  })

  it('set then get round-trips a value, including non-string types', async () => {
    await set('dailyGoalMinutes', 15)
    expect(await get('dailyGoalMinutes', 0)).toBe(15)

    await set('notifications', { enabled: true, hour: 9 })
    expect(await get('notifications', { enabled: false, hour: 0 })).toEqual({
      enabled: true,
      hour: 9,
    })
  })

  it('set overwrites a previous value for the same key', async () => {
    await set('theme', 'dark')
    await set('theme', 'light')
    expect(await get('theme', 'system')).toBe('light')
  })

  it('remove deletes the key so a subsequent get falls back again', async () => {
    await set('theme', 'dark')
    await remove('theme')
    expect(await get('theme', 'system')).toBe('system')
  })
})
