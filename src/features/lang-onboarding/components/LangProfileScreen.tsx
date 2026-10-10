/**
 * First-run language screen (`spec/tasks/52-language-onboarding.md` §2): "Какой язык вы
 * знаете?" with two radio cards — «Русский» (profile `ru`) and «Белорусский» (profile `by`, i.e.
 * Russian + Belarusian). Presentational: the caller's `onChoose` stores the profile.
 *
 * Native `input[type=radio]` inside each card's `<label>` — one choice only, arrows and Space
 * work with no code of ours, and the whole card is the ≥44px target. Nothing is preselected and
 * «Продолжить» stays disabled until a card is picked, so the stored profile is always a real
 * answer. While `onChoose` runs the button is locked (no double submit); if it rejects the
 * pick is kept, an error is shown under the button and the learner can press it again.
 */
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import type { LangProfile } from '@/learning/session/lang-profile.ts'
import { FlagBcb, FlagRu } from './Flags.tsx'

/** The profiles this screen offers; Ukrainian (`ua`) is chosen only in the settings. */
export type OnboardingProfile = Extract<LangProfile, 'ru' | 'by'>

interface OnboardingOption {
  readonly profile: OnboardingProfile
  readonly title: string
  readonly hint: string
  readonly flag: ReactNode
}

const OPTIONS: readonly OnboardingOption[] = [
  { profile: 'ru', title: 'Русский', hint: 'Знаю русский', flag: <FlagRu /> },
  {
    profile: 'by',
    title: 'Белорусский',
    hint: 'Знаю белорусский и русский',
    flag: <FlagBcb />,
  },
]

export function LangProfileScreen({
  onChoose,
}: {
  onChoose: (profile: OnboardingProfile) => Promise<void>
}) {
  const headingId = useId()
  const [selected, setSelected] = useState<OnboardingProfile | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected === null || pending) return
    setPending(true)
    setFailed(false)
    try {
      await onChoose(selected)
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
            Какой язык вы знаете?
          </h1>
          <p className="text-body-md text-muted-foreground">
            От этого зависят уровни слов и переводы на карточках. Выбор можно поменять в
            настройках.
          </p>
        </div>

        <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-3">
          {OPTIONS.map((option) => (
            <label
              key={option.profile}
              className="group relative flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors select-none has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
            >
              <input
                type="radio"
                name="lang-profile"
                value={option.profile}
                checked={selected === option.profile}
                disabled={pending}
                onChange={() => setSelected(option.profile)}
                className="sr-only"
              />
              {option.flag}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-headline-sm">{option.title}</span>
                <span className="text-body-md text-muted-foreground">{option.hint}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card group-has-checked:border-primary"
              >
                <span className="size-3 rounded-full bg-primary opacity-0 group-has-checked:opacity-100" />
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={selected === null || pending}>
            Продолжить
          </Button>
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
