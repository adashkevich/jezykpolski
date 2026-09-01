/**
 * `/words` filter state (`spec/tasks/07-words-list.md` §8, FR-30 "состояние фильтров
 * сохраняется между визитами").
 *
 * **Persist backend — `settings.repository.ts`, not `localStorage`.** The task text offers
 * both ("используй settings-репозиторий ... либо localStorage, выбери разумно"). This app's
 * repository layer (`architecture.md` §3, NFR-19: "UI не знает о будущей облачной
 * синхронизации; доступ к данным идёт через repository-слой") already treats
 * IndexedDB-via-repositories as the one place persistent app state lives; every other piece
 * of durable state in this codebase (`skills`, `wordProgress`, `settings`, `meta`) goes
 * through a `db/repositories/**` function, never a bare Web Storage call. Filter state is
 * exactly the kind of thing `settings` was already designed for ("небольшой набор
 * пользовательских настроек" — `database.ts`'s own doc comment), so routing it through
 * `localStorage` instead would just be a second, inconsistent persistence mechanism for no
 * benefit. `zustand/middleware/persist` accepts an async custom `PersistStorage`, which is
 * all `settingsStorage` below is: `get`/`set`/`remove` from `settings.repository.ts` wrapped
 * to the shape `persist` expects. Hydration is therefore async — the store starts at
 * `DEFAULT_FILTERS` and snaps to the persisted values a tick later once IndexedDB answers
 * (typically sub-millisecond for one small row read off an already-open connection, since
 * `DatabaseProvider` has already resolved `openDatabase()` by the time any route that reads
 * this store can mount) rather than synchronously like `localStorage` would. That tradeoff
 * (a possible one-frame flash of default filters on cold load) is worth it for keeping all
 * persistent state behind one architectural seam.
 *
 * `scrollOffset` intentionally lives in this same store (simplest place for
 * `VirtualWordList` and `WordsListPage` to share it) but is excluded from `partialize` — it's
 * per-session scroll position, not a durable filter preference, and persisting it would mean
 * restoring a stale offset against a possibly different filtered result set after a reload.
 */
import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { LevelValue, PosValue } from '@/content/codec.ts'
import type { WordQuery } from '@/content/query.ts'
import type { WordStatus } from '@/types/progress.ts'
import * as settingsRepo from '@/db/repositories/settings.repository.ts'

export type SortOption = WordQuery['sort']
export type TopNOption = 500 | 1000 | 2000 | 5000 | null

interface PersistedFilters {
  /** Explicit multi-select levels, used when `upToMode` is off. */
  levels: LevelValue[]
  /** FR-22: "До уровня X" mode — when on, `upToLevel` (not `levels`) drives the query. */
  upToMode: boolean
  upToLevel: LevelValue | null
  /** Single-select POS tab (FR-23); `null` = "Все". */
  pos: PosValue | null
  /** Single-select status filter (FR-24); `null` = "Все". */
  status: WordStatus | null
  /** FR-25; `null` = "Все". */
  topN: TopNOption
  /** FR-26. */
  sort: SortOption
  /** FR-27, pre-debounce committed value. */
  search: string
}

interface FiltersState extends PersistedFilters {
  /** Not persisted — see file header. Current scroll offset of the virtualized list's own
   *  scroll container, so returning from a word-card navigation can restore it. */
  scrollOffset: number
  toggleLevel: (level: LevelValue) => void
  setUpToMode: (on: boolean) => void
  setUpToLevel: (level: LevelValue) => void
  setPos: (pos: PosValue | null) => void
  setStatus: (status: WordStatus | null) => void
  setTopN: (topN: TopNOption) => void
  setSort: (sort: SortOption) => void
  setSearch: (search: string) => void
  setScrollOffset: (offset: number) => void
  /** Clears every filter back to defaults — the `EmptyState` "сбросить фильтры" action. Does
   *  NOT touch `scrollOffset` (nothing in the reset UX implies "also forget my scroll spot"). */
  reset: () => void
}

const DEFAULT_FILTERS: PersistedFilters = {
  levels: [],
  upToMode: false,
  upToLevel: null,
  pos: null,
  status: null,
  topN: null,
  sort: 'frequency',
  search: '',
}

const SETTINGS_KEY = 'wordsListFilters'

const settingsStorage: PersistStorage<PersistedFilters> = {
  getItem: async (name) => {
    return settingsRepo.get<StorageValue<PersistedFilters> | null>(name, null)
  },
  setItem: async (name, value) => {
    await settingsRepo.set(name, value)
  },
  removeItem: async (name) => {
    await settingsRepo.remove(name)
  },
}

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set) => ({
      ...DEFAULT_FILTERS,
      scrollOffset: 0,

      toggleLevel: (level) =>
        set((state) => ({
          levels: state.levels.includes(level)
            ? state.levels.filter((l) => l !== level)
            : [...state.levels, level],
        })),

      setUpToMode: (on) =>
        set((state) => ({
          upToMode: on,
          // Switching the mode off drops whatever level was picked "up to" — it has no
          // meaning as a plain multi-select entry, and leaving it set would silently keep
          // filtering by it if the mode were re-enabled later with a stale value.
          upToLevel: on ? state.upToLevel : null,
        })),
      setUpToLevel: (level) => set({ upToLevel: level }),

      setPos: (pos) => set({ pos }),
      setStatus: (status) => set({ status }),
      setTopN: (topN) => set({ topN }),
      setSort: (sort) => set({ sort }),
      setSearch: (search) => set({ search }),
      setScrollOffset: (offset) => set({ scrollOffset: offset }),

      reset: () => set({ ...DEFAULT_FILTERS }),
    }),
    {
      name: SETTINGS_KEY,
      storage: settingsStorage,
      partialize: (state): PersistedFilters => ({
        levels: state.levels,
        upToMode: state.upToMode,
        upToLevel: state.upToLevel,
        pos: state.pos,
        status: state.status,
        topN: state.topN,
        sort: state.sort,
        search: state.search,
      }),
    },
  ),
)

/** Derives a `content/query.ts` `WordQuery` from the current filter state. Pure function (not
 *  a hook) so both the real page and tests can call it against a plain state snapshot without
 *  rendering anything. */
export function filtersToQuery(state: PersistedFilters): WordQuery {
  return {
    levels: state.upToMode ? undefined : state.levels.length > 0 ? state.levels : undefined,
    upToLevel: state.upToMode && state.upToLevel ? state.upToLevel : undefined,
    pos: state.pos ? [state.pos] : undefined,
    status: state.status ? [state.status] : undefined,
    topN: state.topN ?? null,
    search: state.search.trim() ? state.search : undefined,
    sort: state.sort,
  }
}
