/**
 * The languages the learner knows and the word index built for them (`spec/tasks/51-language-
 * profile.md` §2, `52-language-onboarding.md`) as React state.
 *
 * Both read `content/index-store.ts` through `useSyncExternalStore`, not the `settings` table:
 * the store is what the rest of the app actually computes with (`getIndexStore()` in
 * repositories and the session builder), and `ContentProvider` is the one place that turns the
 * `langProfile` setting into `setIndexStoreLangs(...)` (the first-run screen applies its own
 * answer the same way, a moment ahead). Reading the store keeps a component's languages and the
 * levels it gets from the index in step — a component never sees the new languages next to the
 * old index, or the other way round. A switch hands out a new index object, so passing
 * {@link useContentIndex}'s result (or {@link useKnownLangs}'s, for a query that reads the store
 * itself, like `useLevelGate`) as a `useMemo`/`useLiveQuery` dependency is all a consumer needs
 * to recompute; {@link useKnownLangs} returns one object per set, so it is a valid dependency.
 */
import { useSyncExternalStore } from 'react'
import {
  getIndexStore,
  getIndexStoreLangs,
  subscribeIndexStore,
  type ContentIndex,
} from '@/content/index-store.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import {
  DEFAULT_KNOWN_LANGS,
  LANG_PROFILE_SETTING_KEY,
  parseKnownLangs,
  type KnownLangs,
} from '@/learning/session/lang-profile.ts'

/** The stored languages, validated (`parseKnownLangs`) — an imported backup may carry anything. */
export async function readKnownLangsSetting(): Promise<KnownLangs> {
  return parseKnownLangs(
    await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, DEFAULT_KNOWN_LANGS),
  )
}

/** The word index of the active languages; re-renders the caller when they switch. */
export function useContentIndex(): ContentIndex {
  return useSyncExternalStore(subscribeIndexStore, getIndexStore)
}

/** The languages the learner knows — the ones the index was built for. */
export function useKnownLangs(): KnownLangs {
  return useSyncExternalStore(subscribeIndexStore, getIndexStoreLangs)
}
