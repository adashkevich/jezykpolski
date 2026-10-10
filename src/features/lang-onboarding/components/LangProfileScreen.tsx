/**
 * First-run language screen (`spec/tasks/52-language-onboarding.md` §2): "Какие языки вы
 * знаете?" with three checkbox cards — «Знаю русский», «Знаю беларуский», «Знаю украинский».
 * Presentational: the caller's `onChoose` stores the answer.
 *
 * Any combination is allowed, Russian included: it is ticked when the screen opens (what most
 * learners know) and can be un-ticked, but «Продолжить» stays locked with a hint while nothing
 * is ticked, so the stored answer is never empty. Native `input[type=checkbox]` inside each
 * card's `<label>` — Space toggles with no code of ours, and the whole card is the ≥44px target.
 * The answer is handed over in `ru`, `by`, `ua` order. While `onChoose` runs the screen is
 * locked (no double submit); if it rejects the ticks are kept, an error is shown under the
 * button and the learner can press it again.
 */
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { LANG_PROFILES } from '@/content/codec.ts'
import {
  canonicalKnownLangs,
  DEFAULT_KNOWN_LANGS,
  type KnownLangs,
  type LangProfile,
} from '@/learning/session/lang-profile.ts'
import { KNOWN_LANG_LABEL } from '@/lib/known-lang-labels.ts'
import { FlagBcb, FlagRu, FlagUa } from './Flags.tsx'

const FLAG: Readonly<Record<LangProfile, ReactNode>> = {
  ru: <FlagRu />,
  by: <FlagBcb />,
  ua: <FlagUa />,
}

export function LangProfileScreen({
  onChoose,
}: {
  onChoose: (langs: KnownLangs) => Promise<void>
}) {
  const headingId = useId()
  const [ticked, setTicked] = useState<ReadonlySet<LangProfile>>(new Set(DEFAULT_KNOWN_LANGS))
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const nothingTicked = ticked.size === 0

  function toggle(lang: LangProfile) {
    const next = new Set(ticked)
    if (!next.delete(lang)) next.add(lang)
    setTicked(next)
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (nothingTicked || pending) return
    setPending(true)
    setFailed(false)
    try {
      await onChoose(canonicalKnownLangs(ticked))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <main
      className="min-h-svh bg-background text-foreground"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-center gap-8 px-4 py-10 sm:px-6"
      >
        <div className="flex flex-col gap-3">
          <p className="font-heading text-headline-md font-bold tracking-[-0.02em]">
            Język<span className="text-primary">Polski</span>
          </p>
          <h1 id={headingId} className="font-heading text-headline-lg">
            Какие языки вы знаете?
          </h1>
          <p className="text-body-md text-muted-foreground">
            Можно отметить несколько. От этого зависят уровни слов и переводы на карточках. Выбор
            можно поменять в настройках.
          </p>
        </div>

        <div role="group" aria-labelledby={headingId} className="flex flex-col gap-3">
          {LANG_PROFILES.map((lang) => (
            <label
              key={lang}
              className="group relative flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors select-none has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/40 has-disabled:cursor-default"
            >
              <input
                type="checkbox"
                name="known-lang"
                value={lang}
                checked={ticked.has(lang)}
                disabled={pending}
                onChange={() => toggle(lang)}
                className="sr-only"
              />
              {FLAG[lang]}
              <span className="min-w-0 flex-1 text-headline-sm">{KNOWN_LANG_LABEL[lang]}</span>
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-border bg-card group-has-checked:border-primary group-has-checked:bg-primary"
              >
                <Check
                  className="size-4 text-primary-foreground opacity-0 group-has-checked:opacity-100"
                  strokeWidth={3}
                />
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={nothingTicked || pending}>
            Продолжить
          </Button>
          {nothingTicked && (
            <p className="text-body-sm text-muted-foreground">Отметьте хотя бы один язык.</p>
          )}
          {failed && (
            <p role="alert" className="text-body-sm text-destructive">
              Не удалось сохранить выбор. Попробуйте ещё раз.
            </p>
          )}
        </div>
      </form>
    </main>
  )
}
