/**
 * The language profile's own translations of a sense (`spec/tasks/51-language-profile.md` §3) —
 * one line under the Russian ones: «бел. …» / «укр. …», the translations tagged `lang="be"` /
 * `lang="uk"` so screen readers and hyphenation treat them as that language. Shared by the word
 * card (`SensesList`, every sense) and the exercise feedback (`ExerciseFeedback`, the primary
 * sense). Renders nothing without a value — the `ru` profile, or details not loaded (see
 * `lang-profile.ts#profileTranslationsOf`).
 */
import { cn } from '@/lib/utils'
import type { ExtraLangProfile, ProfileTranslations } from '@/learning/session/lang-profile.ts'

const LANGUAGE: Readonly<Record<ExtraLangProfile, { marker: string; name: string; lang: string }>> =
  {
    by: { marker: 'бел.', name: 'по-белорусски', lang: 'be' },
    ua: { marker: 'укр.', name: 'по-украински', lang: 'uk' },
  }

export function ProfileTranslationsLine({
  value,
  className,
}: {
  value: ProfileTranslations | undefined
  className?: string
}) {
  if (!value) return null
  const language = LANGUAGE[value.profile]
  return (
    <p className={cn('text-body-md text-muted-foreground', className)}>
      <abbr title={language.name} className="mr-1.5 text-label-md font-semibold no-underline">
        {language.marker}
      </abbr>
      <span lang={language.lang}>{value.translations.join(', ')}</span>
    </p>
  )
}
