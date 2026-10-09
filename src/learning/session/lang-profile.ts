/**
 * The learner's language profile (`spec/tasks/51-language-profile.md`): knows Russian only
 * (`ru`), Russian + Belarusian (`by`) or Russian + Ukrainian (`ua`).
 *
 * The profile picks the column of `WordIndexEntry.levels` / `Sense.levels` the app works with —
 * level gate, filters, `/stats` (`content/index-store.ts` builds `WordIndexEntry.level` from it) —
 * and which extra translations (Belarusian / Ukrainian, from the lazy `sense-details` shard) the
 * word card and the exercise feedback show under the Russian ones. The interface, the exercise
 * questions and answer checking stay Russian in every profile (task text §1, §3).
 *
 * Same house convention as `level-gate.ts`'s `NEW_WORDS_START_LEVEL_SETTING_KEY`: a bare
 * `*_SETTING_KEY`/`DEFAULT_*` pair, read through `settings.repository.ts` by the caller — this
 * pure `learning/**` module never touches Dexie. Unlike that setting, every read of this one
 * goes through {@link parseLangProfile}: the value can arrive from an imported backup file, and
 * an unknown profile must not reach `levels[profile]`.
 */
import { LANG_PROFILES, type LangProfile } from '@/content/codec.ts'
import type { SenseDetails } from '@/types/content.ts'

export type { LangProfile }

/** `settings` table key (`db/repositories/settings.repository.ts`). */
export const LANG_PROFILE_SETTING_KEY = 'langProfile'

/** The profile used when nothing (or nothing valid) is stored. */
export const DEFAULT_LANG_PROFILE: LangProfile = 'ru'

/** A stored setting value as a profile — anything but `'ru'`/`'by'`/`'ua'` (a missing row, a
 *  hand-edited or foreign backup) reads as {@link DEFAULT_LANG_PROFILE}. */
export function parseLangProfile(value: unknown): LangProfile {
  return LANG_PROFILES.find((profile) => profile === value) ?? DEFAULT_LANG_PROFILE
}

/** A profile that adds a second language on top of Russian. */
export type ExtraLangProfile = Exclude<LangProfile, 'ru'>

/** The profile's own translations of one sense, for the line under the Russian ones. */
export interface ProfileTranslations {
  readonly profile: ExtraLangProfile
  readonly translations: readonly string[]
}

/**
 * The extra line for `profile` from a sense's details (task text §3): `undefined` in the `ru`
 * profile (Russian is already shown), while the details shard hasn't arrived (or never will,
 * offline), and when the list is empty — never an empty line.
 */
export function profileTranslationsOf(
  profile: LangProfile,
  details: Pick<SenseDetails, ExtraLangProfile> | undefined,
): ProfileTranslations | undefined {
  if (profile === 'ru' || details === undefined) return undefined
  const translations = details[profile]
  return translations.length > 0 ? { profile, translations } : undefined
}
