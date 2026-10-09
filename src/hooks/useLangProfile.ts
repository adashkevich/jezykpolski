/**
 * The active language profile and the word index built for it (`spec/tasks/51-language-
 * profile.md` §2) as React state.
 *
 * Both read `content/index-store.ts` through `useSyncExternalStore`, not the `settings` table:
 * the store is what the rest of the app actually computes with (`getIndexStore()` in
 * repositories and the session builder), and `ContentProvider` is the one place that turns the
 * `langProfile` setting into `setIndexStoreProfile(...)`. Reading the store keeps a component's
 * profile and the levels it gets from the index in step — a component never sees the new
 * profile next to the old index, or the other way round. A profile switch hands out a new
 * index object, so passing {@link useContentIndex}'s result (or {@link useLangProfile}'s, for
 * a query that reads the store itself, like `useLevelGate`) as a `useMemo`/`useLiveQuery`
 * dependency is all a consumer needs to recompute.
 */
import { useSyncExternalStore } from 'react'
import {
  getIndexStore,
  getIndexStoreProfile,
  subscribeIndexStore,
  type ContentIndex,
} from '@/content/index-store.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'
import {
  DEFAULT_LANG_PROFILE,
  LANG_PROFILE_SETTING_KEY,
  parseLangProfile,
  type LangProfile,
} from '@/learning/session/lang-profile.ts'

/** The stored profile, validated (`parseLangProfile`) — an imported backup may carry anything. */
export async function readLangProfileSetting(): Promise<LangProfile> {
  return parseLangProfile(
    await settingsRepo.get<unknown>(LANG_PROFILE_SETTING_KEY, DEFAULT_LANG_PROFILE),
  )
}

/** The word index of the active profile; re-renders the caller when the profile switches. */
export function useContentIndex(): ContentIndex {
  return useSyncExternalStore(subscribeIndexStore, getIndexStore)
}

/** The active language profile — the one the index was built for. */
export function useLangProfile(): LangProfile {
  return useSyncExternalStore(subscribeIndexStore, getIndexStoreProfile)
}
