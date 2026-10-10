/**
 * The languages the learner knows (`spec/tasks/51-language-profile.md`, widened to a set by
 * `spec/tasks/52-language-onboarding.md`): any non-empty combination of Russian (`ru`),
 * Belarusian (`by`) and Ukrainian (`ua`).
 *
 * The set picks the level the app works with — level gate, filters, `/stats`
 * (`content/index-store.ts` builds `WordIndexEntry.level` from it, {@link levelForKnownLangs}) —
 * and which extra translations (Belarusian / Ukrainian, from the lazy `sense-details` shard) the
 * word card and the exercise feedback show under the Russian ones
 * ({@link knownLangsTranslations}). The interface, the exercise questions, the answer checking
 * and the Russian translations stay Russian whatever is ticked (task 51 §1, §3), so un-ticking
 * Russian changes nothing the app shows.
 *
 * Same house convention as `level-gate.ts`'s `NEW_WORDS_START_LEVEL_SETTING_KEY`: a bare
 * `*_SETTING_KEY`/`DEFAULT_*` pair, read through `settings.repository.ts` by the caller — this
 * pure `learning/**` module never touches Dexie. Every read of the stored value goes through
 * {@link parseKnownLangs}: it can arrive from an imported backup, and an unknown value must not
 * reach `levels[lang]`.
 *
 * Stored value: a list of codes (`["ru","by"]`). Task 51 stored one string — `"ru"`, `"by"` or
 * `"ua"`, meaning Russian only / Russian + Belarusian / Russian + Ukrainian — and those still
 * read correctly (backups made before the change, a settings row from the old build).
 */
import { LANG_PROFILES, LEVEL_VALUES, type LangProfile, type LevelValue } from '@/content/codec.ts'
import type { ProfileLevels, SenseDetails } from '@/types/content.ts'

export type { LangProfile }

/** `settings` table key (`db/repositories/settings.repository.ts`). */
export const LANG_PROFILE_SETTING_KEY = 'langProfile'

/**
 * The languages the learner knows: one to three of `ru`/`by`/`ua`, always in that order and
 * without repeats ({@link canonicalKnownLangs}). Russian may be missing — a Belarusian or
 * Ukrainian speaker who does not know it.
 */
export type KnownLangs = readonly LangProfile[]

/** What is used when nothing (or nothing valid) is stored: Russian only. */
export const DEFAULT_KNOWN_LANGS: KnownLangs = Object.freeze(['ru'] as const)

/** Task 51's single-profile strings, as the set each one meant. */
const LEGACY_PROFILES: ReadonlyMap<string, KnownLangs> = new Map([
  ['ru', ['ru']],
  ['by', ['ru', 'by']],
  ['ua', ['ru', 'ua']],
])

/** A stored value as a non-empty set, or `undefined` when it is none (see {@link parseKnownLangs}). */
function normalizeKnownLangs(value: unknown): KnownLangs | undefined {
  if (typeof value === 'string') return LEGACY_PROFILES.get(value)
  if (!Array.isArray(value)) return undefined
  const langs = LANG_PROFILES.filter((lang) => value.includes(lang))
  return langs.length > 0 ? langs : undefined
}

/**
 * A stored setting value as the learner's languages. Anything that holds no known language — a
 * missing value, an empty list, a foreign or hand-edited backup — reads as
 * {@link DEFAULT_KNOWN_LANGS}; entries that are no language are dropped from a list that has
 * some. The stored value itself is never rewritten by a read.
 */
export function parseKnownLangs(value: unknown): KnownLangs {
  return normalizeKnownLangs(value) ?? DEFAULT_KNOWN_LANGS
}

/**
 * Whether the first-run language screen (`spec/tasks/52-language-onboarding.md` §1) is due for
 * this stored setting value: yes unless it holds at least one known language. No separate
 * "shown" flag exists — the stored answer *is* the record that the question was asked, so a
 * missing row (`null`/`undefined`) and a value no language recognises both ask again.
 */
export function needsKnownLangsChoice(stored: unknown): boolean {
  return normalizeKnownLangs(stored) === undefined
}

/** `langs` in `ru`, `by`, `ua` order without repeats; an empty input is {@link DEFAULT_KNOWN_LANGS}. */
export function canonicalKnownLangs(langs: Iterable<LangProfile>): KnownLangs {
  const wanted = new Set(langs)
  const ordered = LANG_PROFILES.filter((lang) => wanted.has(lang))
  return ordered.length > 0 ? ordered : DEFAULT_KNOWN_LANGS
}

/** Identity of a canonical set — `"ru+by"` — for caches keyed by what the learner knows. */
export function knownLangsKey(langs: KnownLangs): string {
  return langs.join('+')
}

/**
 * The level of something (a word, a sense) for a learner who knows `langs`, from its
 * per-language `levels` (task 47: the `by`/`ua` columns already assume Russian on top):
 *  - only Russian → the `ru` column;
 *  - any other language → the easiest of those languages' columns. Russian adds nothing to them
 *    (their columns already include it), so ticking it or not does not move a level; with both
 *    Belarusian and Ukrainian a word is as easy as it is in whichever of the two is closer.
 */
export function levelForKnownLangs(levels: ProfileLevels, langs: KnownLangs): LevelValue {
  let easiest: LevelValue | undefined
  for (const lang of langs) {
    if (lang === 'ru') continue
    const level = levels[lang]
    if (easiest === undefined || LEVEL_VALUES.indexOf(level) < LEVEL_VALUES.indexOf(easiest)) {
      easiest = level
    }
  }
  return easiest ?? levels.ru
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

/**
 * The extra lines for a learner who knows `langs` (task 51 §3, one per language): the
 * Belarusian and/or Ukrainian translations of a sense, in `by`, `ua` order. Empty for Russian
 * only, while the details shard hasn't arrived, and for a language with no translation — never
 * an empty line.
 */
export function knownLangsTranslations(
  langs: KnownLangs,
  details: Pick<SenseDetails, ExtraLangProfile> | undefined,
): readonly ProfileTranslations[] {
  return langs.flatMap((lang) => profileTranslationsOf(lang, details) ?? [])
}
