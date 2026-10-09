/**
 * `lang-profile.ts` (`spec/tasks/51-language-profile.md` §1, §3): reading the stored setting
 * and picking the profile's extra translations of a sense.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANG_PROFILE,
  LANG_PROFILE_SETTING_KEY,
  parseLangProfile,
  profileTranslationsOf,
} from './lang-profile.ts'
import type { SenseDetails } from '@/types/content.ts'

/** Real `radzić:advise` details (`public/content/sense-details/015.json`). */
const RADZIC_ADVISE: SenseDetails = {
  gloss: 'udzielać komuś rady',
  example: 'Radzę ci odpocząć.',
  by: ['раіць'],
  ua: ['радити'],
}

describe('LANG_PROFILE_SETTING_KEY / DEFAULT_LANG_PROFILE', () => {
  it('the setting is "langProfile", and the default is the Russian-only profile', () => {
    expect(LANG_PROFILE_SETTING_KEY).toBe('langProfile')
    expect(DEFAULT_LANG_PROFILE).toBe('ru')
  })
})

describe('parseLangProfile', () => {
  it('passes the three known profiles through', () => {
    expect(parseLangProfile('ru')).toBe('ru')
    expect(parseLangProfile('by')).toBe('by')
    expect(parseLangProfile('ua')).toBe('ua')
  })

  it('reads anything else — a missing value, a foreign or hand-edited backup — as "ru"', () => {
    for (const value of [undefined, null, '', 'pl', 'be', 'uk', 'UA', 1, {}, ['ua']]) {
      expect(parseLangProfile(value)).toBe('ru')
    }
  })
})

describe('profileTranslationsOf', () => {
  it('ru: no extra line — Russian is already shown', () => {
    expect(profileTranslationsOf('ru', RADZIC_ADVISE)).toBeUndefined()
  })

  it('by / ua: that language’s translations of the sense', () => {
    expect(profileTranslationsOf('by', RADZIC_ADVISE)).toEqual({
      profile: 'by',
      translations: ['раіць'],
    })
    expect(profileTranslationsOf('ua', RADZIC_ADVISE)).toEqual({
      profile: 'ua',
      translations: ['радити'],
    })
  })

  it('no line while the details have not loaded, and none for an empty list', () => {
    expect(profileTranslationsOf('ua', undefined)).toBeUndefined()
    expect(profileTranslationsOf('by', { ...RADZIC_ADVISE, by: [] })).toBeUndefined()
  })
})
