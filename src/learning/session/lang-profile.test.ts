/**
 * `lang-profile.ts` (`spec/tasks/51-language-profile.md` §1, §3; `52-language-onboarding.md`):
 * the set of languages the learner knows — reading the stored setting, the level it yields, and
 * the extra translations of a sense it shows.
 */
import { describe, expect, it } from 'vitest'
import {
  canonicalKnownLangs,
  DEFAULT_KNOWN_LANGS,
  knownLangsKey,
  knownLangsTranslations,
  LANG_PROFILE_SETTING_KEY,
  levelForKnownLangs,
  needsKnownLangsChoice,
  parseKnownLangs,
  profileTranslationsOf,
} from './lang-profile.ts'
import type { ProfileLevels, SenseDetails } from '@/types/content.ts'

/** Real `radzić:advise` details (`public/content/sense-details/015.json`). */
const RADZIC_ADVISE: SenseDetails = {
  gloss: 'udzielać komuś rady',
  example: 'Radzę ci odpocząć.',
  by: ['раіць'],
  ua: ['радити'],
}

describe('LANG_PROFILE_SETTING_KEY / DEFAULT_KNOWN_LANGS', () => {
  it('the setting is "langProfile", and the default is Russian only', () => {
    expect(LANG_PROFILE_SETTING_KEY).toBe('langProfile')
    expect(DEFAULT_KNOWN_LANGS).toEqual(['ru'])
  })
})

describe('parseKnownLangs', () => {
  it('reads a stored list of languages', () => {
    expect(parseKnownLangs(['ru'])).toEqual(['ru'])
    expect(parseKnownLangs(['ru', 'by'])).toEqual(['ru', 'by'])
    expect(parseKnownLangs(['by', 'ua'])).toEqual(['by', 'ua'])
    expect(parseKnownLangs(['ru', 'by', 'ua'])).toEqual(['ru', 'by', 'ua'])
  })

  it('a list without Russian is a valid answer — the learner may not know it', () => {
    expect(parseKnownLangs(['ua'])).toEqual(['ua'])
  })

  it('orders and de-duplicates: the stored order and repeats carry no meaning', () => {
    expect(parseKnownLangs(['ua', 'ru', 'ua', 'by'])).toEqual(['ru', 'by', 'ua'])
  })

  it('drops entries that are no language of ours but keeps the rest', () => {
    expect(parseKnownLangs(['ru', 'pl', 7, null, 'by'])).toEqual(['ru', 'by'])
  })

  it('reads the single profile strings task 51 stored as "Russian + that language"', () => {
    expect(parseKnownLangs('ru')).toEqual(['ru'])
    expect(parseKnownLangs('by')).toEqual(['ru', 'by'])
    expect(parseKnownLangs('ua')).toEqual(['ru', 'ua'])
  })

  it('reads anything else — a missing value, an empty list, a foreign or hand-edited backup — as Russian only', () => {
    for (const value of [undefined, null, '', 'pl', 'be', 'UA', 1, {}, [], ['pl'], [1, 2]]) {
      expect(parseKnownLangs(value)).toEqual(['ru'])
    }
  })

  it('does not take Object.prototype names for stored profiles', () => {
    expect(parseKnownLangs('constructor')).toEqual(['ru'])
    expect(parseKnownLangs('toString')).toEqual(['ru'])
  })
})

describe('needsKnownLangsChoice (task 52)', () => {
  it('is false for a stored list with at least one known language, and for task 51\'s strings', () => {
    for (const value of [['ru'], ['by'], ['ua'], ['ru', 'ua'], ['ru', 'x'], 'ru', 'by', 'ua']) {
      expect(needsKnownLangsChoice(value)).toBe(false)
    }
  })

  it('is true for no stored row (null from the settings read) and for any foreign value', () => {
    for (const value of [null, undefined, '', 'pl', 'UA', 1, {}, [], ['pl'], [null]]) {
      expect(needsKnownLangsChoice(value)).toBe(true)
    }
  })
})

describe('canonicalKnownLangs / knownLangsKey', () => {
  it('orders ru, by, ua and drops repeats', () => {
    expect(canonicalKnownLangs(['ua', 'by', 'ru', 'by'])).toEqual(['ru', 'by', 'ua'])
  })

  it('never returns an empty set — Russian only stands in', () => {
    expect(canonicalKnownLangs([])).toEqual(['ru'])
  })

  it('the key is the same for the same set however it was written', () => {
    expect(knownLangsKey(canonicalKnownLangs(['by', 'ru']))).toBe(
      knownLangsKey(canonicalKnownLangs(['ru', 'by'])),
    )
    expect(knownLangsKey(['ru', 'by'])).not.toBe(knownLangsKey(['by']))
  })
})

describe('levelForKnownLangs', () => {
  // `uśmiech` (A2 for ru, A1 for by and ua), `radzić` (B1 / A2 / A2) and a word whose
  // columns disagree between by and ua.
  const levels = (ru: ProfileLevels['ru'], by: ProfileLevels['by'], ua: ProfileLevels['ua']) =>
    ({ ru, by, ua }) satisfies ProfileLevels

  it('Russian only: the ru column', () => {
    expect(levelForKnownLangs(levels('A2', 'A1', 'A1'), ['ru'])).toBe('A2')
  })

  it('Russian + one more language: that language’s column (the by/ua columns already assume Russian)', () => {
    expect(levelForKnownLangs(levels('A2', 'A1', 'B1'), ['ru', 'by'])).toBe('A1')
    expect(levelForKnownLangs(levels('A2', 'A1', 'B1'), ['ru', 'ua'])).toBe('B1')
  })

  it('without Russian: the other language’s column alone — Russian no longer enters', () => {
    expect(levelForKnownLangs(levels('A1', 'B1', 'A2'), ['by'])).toBe('B1')
    expect(levelForKnownLangs(levels('A1', 'B1', 'A2'), ['ua'])).toBe('A2')
  })

  it('several languages: the easiest of their columns', () => {
    expect(levelForKnownLangs(levels('B2', 'B1', 'A2'), ['by', 'ua'])).toBe('A2')
    expect(levelForKnownLangs(levels('B2', 'A2', 'B1'), ['ru', 'by', 'ua'])).toBe('A2')
  })

  it('a column harder than ru is still the learner’s level when Russian is the only other language', () => {
    // 2 of 7986 real words have by > ru; "Russian + Belarusian" has always meant the by column.
    expect(levelForKnownLangs(levels('A1', 'A2', 'A1'), ['ru', 'by'])).toBe('A2')
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

describe('knownLangsTranslations', () => {
  it('Russian only: no extra lines — Russian is already shown', () => {
    expect(knownLangsTranslations(['ru'], RADZIC_ADVISE)).toEqual([])
  })

  it('one line per extra known language, in by, ua order (the canonical order of the set)', () => {
    expect(knownLangsTranslations(['ru', 'by'], RADZIC_ADVISE)).toEqual([
      { profile: 'by', translations: ['раіць'] },
    ])
    expect(knownLangsTranslations(['ru', 'by', 'ua'], RADZIC_ADVISE)).toEqual([
      { profile: 'by', translations: ['раіць'] },
      { profile: 'ua', translations: ['радити'] },
    ])
  })

  it('leaves out a language with no translation, and everything before the details have loaded', () => {
    expect(knownLangsTranslations(['by', 'ua'], { ...RADZIC_ADVISE, by: [] })).toEqual([
      { profile: 'ua', translations: ['радити'] },
    ])
    expect(knownLangsTranslations(['by', 'ua'], undefined)).toEqual([])
  })
})
