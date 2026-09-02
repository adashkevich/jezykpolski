/**
 * Generic live-read + immediate-write binding for one `settings` table key
 * (`spec/tasks/24-settings-backup.md` acceptance point 10: "все настройки применяются
 * немедленно и переживают перезагрузку"). Every control on `/settings` that maps directly
 * to an existing `*_SETTING_KEY`/`*_DEFAULT` pair (`session-scope.ts`'s `sessionTargetSize`/
 * `dailyNewWordsBudget`, `hint-mode.ts`'s `nounHintMode`, `default-exercise-type.ts`'s
 * `defaultExerciseTypes`, `theme.ts`'s `theme`, `paradigm-prefetch`'s own toggle key) uses
 * this one hook instead of five near-identical `useLiveQuery` + `settingsRepo.set` call
 * sites.
 *
 * "Immediate" (not "immediate, pending a page reload"): `useLiveQuery` re-runs the moment
 * `settingsRepo.set` commits its Dexie write — `dexie-react-hooks` tracks which table a live
 * query touched during its last run and invalidates on the next write to it, regardless of
 * which component made that write. "Survives reload": simply a consequence of reading
 * through `settings.repository.ts` at all — persistence was never this hook's job to add.
 *
 * `fallback` must be a stable reference (a module-level `*_DEFAULT` constant, per house
 * convention — never an inline object/array literal at the call site) since it's read
 * directly inside the live query without being listed in its own dependency array; passing
 * an inline literal would still work `dexie-react-hooks`-wise (the query function itself is
 * still keyed by `key`) but would defeat memoization for callers that also pass `value` back
 * into a `React.memo`-wrapped child.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'

export function useSetting<T>(key: string, fallback: T): [T | undefined, (value: T) => Promise<void>] {
  const value = useLiveQuery(() => settingsRepo.get<T>(key, fallback), [key])
  return [value, (next: T) => settingsRepo.set(key, next)]
}
