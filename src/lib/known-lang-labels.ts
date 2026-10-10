/**
 * How the languages the learner can know are named where they are ticked — the first-run screen
 * (`features/lang-onboarding`) and «Языки, которые я знаю» in the settings, which must say the
 * same thing. Belarusian is written «беларуский», as the product asks.
 */
import type { LangProfile } from '@/learning/session/lang-profile.ts'

export const KNOWN_LANG_LABEL: Readonly<Record<LangProfile, string>> = {
  ru: 'Знаю русский',
  by: 'Знаю беларуский',
  ua: 'Знаю украинский',
}
