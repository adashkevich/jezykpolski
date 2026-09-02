import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT,
  INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY,
} from '@/learning/skills/training-defaults.ts'
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

  // task 17 (`spec/tasks/17-nouns-section.md` §6): "чтение настройки" for the Wołacz
  // training-default toggle — same generic get/set this whole file already covers, exercised
  // here against the real key/default constants task 18/19 will read (session-scope.ts's
  // own convention: a bare settings key, no dedicated wrapper module).
  it('includeVocativeInTraining (task 17 §6) defaults to off and round-trips through set', async () => {
    expect(
      await get(INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY, INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT),
    ).toBe(false)

    await set(INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY, true)
    expect(
      await get(INCLUDE_VOCATIVE_IN_TRAINING_SETTING_KEY, INCLUDE_VOCATIVE_IN_TRAINING_DEFAULT),
    ).toBe(true)
  })
})
