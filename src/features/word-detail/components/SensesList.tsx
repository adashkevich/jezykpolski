/**
 * "Значения" — `spec/tasks/08-word-detail.md` §2, FR-41, redesigned by task 50
 * (`spec/tasks/50-word-detail-senses-v2.md` §1): every sense listed, primary first (already the
 * order `content/senses.ts#getSenses` returns them in — this component doesn't re-sort), each
 * with its translations, its own level, and — once the lazy `sense-details` shard is in — a
 * Polish gloss and a usage example:
 *
 * ```text
 * 1. закон, право                         [A2] [изучаем]
 *    укр. закон, право                    (a line per known extra language, by/ua — task 51)
 *    ogół przepisów obowiązujących w państwie
 *    «Prawo zabrania palenia w restauracjach.»
 * ```
 *
 * The «изучаем»/«позже» badge says which meaning is being taught (only the primary one is,
 * task 49); with a single sense there is nothing to tell apart, so only the level badge stays.
 * `langs` (tasks 51, 52 — the languages the learner knows) pick the level badge
 * (`lang-profile.ts#levelForKnownLangs` over `Sense.levels`) and add one line of translations
 * per extra known language (Belarusian, Ukrainian) under the Russian ones — they come from the
 * same details shard as the gloss, so those lines too appear once the shard is in.
 */
import { ProfileTranslationsLines } from '@/components/app/ProfileTranslationsLine.tsx'
import {
  knownLangsTranslations,
  levelForKnownLangs,
  type KnownLangs,
} from '@/learning/session/lang-profile.ts'
import type { Sense, SenseDetails } from '@/types/content.ts'
import type { SenseDetailsById, SensesStatus } from '../hooks/useSenses.ts'

const BADGE_CLASS = 'rounded-md px-2 py-1 text-label-md font-semibold whitespace-nowrap'

export function SensesList({
  status,
  senses,
  details,
  error,
  langs,
}: {
  status: SensesStatus
  senses: readonly Sense[]
  /** Gloss/example and by/ua translations per sense id; empty while loading or when the shard
   *  is unavailable. */
  details: SenseDetailsById
  error: Error | undefined
  langs: KnownLangs
}) {
  if (status === 'loading') {
    return <p className="text-body-sm text-muted-foreground">Загрузка значений…</p>
  }

  if (status === 'error') {
    return (
      <p className="text-body-sm text-destructive">
        Не удалось загрузить значения{error ? `: ${error.message}` : ''}.
      </p>
    )
  }

  if (senses.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="sr-only">Значения</h2>
      <ol className="flex flex-col gap-3">
        {senses.map((sense, index) => (
          <SenseItem
            key={sense.id}
            number={index + 1}
            sense={sense}
            details={details.get(sense.id)}
            langs={langs}
            showLearningBadge={senses.length > 1}
          />
        ))}
      </ol>
    </section>
  )
}

function SenseItem({
  number,
  sense,
  details,
  langs,
  showLearningBadge,
}: {
  number: number
  sense: Sense
  details: SenseDetails | undefined
  langs: KnownLangs
  /** «изучаем»/«позже» — only meaningful when there is more than one sense to tell apart. */
  showLearningBadge: boolean
}) {
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-1.5">
      <span aria-hidden="true" className="pt-1 text-label-md font-bold text-primary-strong">
        {number}.
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-headline-sm font-medium text-foreground">
            {sense.ru.join(', ')}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={`${BADGE_CLASS} bg-primary-soft text-primary-strong`}>
              <span className="sr-only">Уровень </span>
              {levelForKnownLangs(sense.levels, langs)}
            </span>
            {showLearningBadge &&
              (sense.primary ? (
                <span className={`${BADGE_CLASS} bg-info-soft text-info`}>изучаем</span>
              ) : (
                <span className={`${BADGE_CLASS} bg-secondary text-muted-foreground`}>позже</span>
              ))}
          </span>
        </div>
        <ProfileTranslationsLines values={knownLangsTranslations(langs, details)} />
        {details && (
          <>
            <p lang="pl" className="text-body-sm text-muted-foreground">
              {details.gloss}
            </p>
            <p lang="pl" className="text-body-md italic text-foreground">
              «{details.example}»
            </p>
          </>
        )}
      </div>
    </li>
  )
}
