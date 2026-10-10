/**
 * Shows the first-run language screen instead of the app until the learner has answered
 * (`spec/tasks/52-language-onboarding.md`).
 *
 * Reads `settings.langProfile` once, on mount — not live, so a settings change or a backup
 * import in the middle of a session never raises the screen. The stored profile is the whole
 * "already asked" record: no row (or a value no profile recognises) → ask; any known profile
 * → straight to `children`. A failed read opens the app too (`console.warn`): this is a
 * preference and must not block start-up.
 *
 * Mounted inside `ContentProvider` (`AppProviders.tsx`): the profile is applied to the index
 * store here, before `children` mount, so the first frame of the app is already in the chosen
 * profile; `ContentProvider`'s live query reaches the same `setIndexStoreProfile` call a moment
 * later and finds it a no-op. `children` is the router, so mounting it only after the answer
 * means a deep link (`/words/...`) still opens as usual once the screen is gone.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { LoadingScreen } from '@/components/app/LoadingScreen.tsx'
import { setIndexStoreProfile } from '@/content/index-store.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import { LANG_PROFILE_SETTING_KEY, needsLangProfileChoice } from '@/learning/session/lang-profile.ts'
import { LangProfileScreen, type OnboardingProfile } from './LangProfileScreen.tsx'

type GateState = 'checking' | 'asking' | 'open'

export function LangProfileGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let cancelled = false

    // `null` = no row; `settings.get` returns the fallback only when the key is absent.
    settingsRepo
      .get<unknown>(LANG_PROFILE_SETTING_KEY, null)
      .then((stored) => {
        if (!cancelled) setState(needsLangProfileChoice(stored) ? 'asking' : 'open')
      })
      .catch((error: unknown) => {
        console.warn('LangProfileGate: could not read the language profile', error)
        if (!cancelled) setState('open')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleChoose(profile: OnboardingProfile) {
    await settingsRepo.set(LANG_PROFILE_SETTING_KEY, profile)
    setIndexStoreProfile(profile)
    setState('open')
  }

  if (state === 'checking') return <LoadingScreen />
  if (state === 'asking') return <LangProfileScreen onChoose={handleChoose} />
  return <>{children}</>
}
