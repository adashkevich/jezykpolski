/**
 * The language profile the app reads levels (and, later, extra translations) for.
 *
 * Task 51 (`spec/tasks/51-language-profile.md`) makes this a user setting
 * (`LANG_PROFILE_SETTING_KEY = 'langProfile'`); until then the app always works in the `ru`
 * profile. Anything that has to pick a column of `Sense.levels` / `WordIndexEntry.levels`
 * takes the profile as a parameter and gets this default from its caller — so the switch in
 * task 51 is one call site per screen, not a hunt through the components.
 */
import type { LangProfile } from '@/content/codec.ts'

export type { LangProfile }

/** The profile used when nothing is chosen — and, until task 51, the only one in use. */
export const DEFAULT_LANG_PROFILE: LangProfile = 'ru'
