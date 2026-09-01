/**
 * Virtualized `/words` result list (`spec/tasks/07-words-list.md` §1/§7 acceptance: "Скролл
 * по всем 7998 словам плавный на мобильном").
 *
 * Owns its own scroll container rather than relying on `AppShell`'s outer `<main
 * overflow-y-auto>` — a `@tanstack/react-virtual` `getScrollElement` needs a stable element
 * reference available at hook-init time, and a ref attached directly to the div this
 * component renders is the straightforward way to get one, vs. reaching up through
 * `closest('main')` and racing the virtualizer's own mount-time measurement effect against
 * ours. `WordsListPage` gives this component's wrapper a bounded height (flex column,
 * `min-h-0 flex-1`) so this is the only element that actually scrolls on the page — `main`'s
 * own scrollbar never engages because its content (the page) now exactly fills it.
 *
 * Fixed row height (`WORD_ROW_HEIGHT` from `WordRow.tsx`) per the task text ("проще и
 * быстрее динамической") — `estimateSize` is therefore also the *actual* size, so no
 * `measureElement`/`ResizeObserver` wiring is needed.
 */
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef } from 'react'
import type { WordIndexEntry } from '@/types/content.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type { WordProgressRecord } from '@/types/progress.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import { useFiltersStore } from '@/stores/filters.store.ts'
import { WordRow, WORD_ROW_HEIGHT } from './WordRow.tsx'

export function VirtualWordList({
  words,
  progress,
  showFormsBar,
}: {
  words: readonly WordIndexEntry[]
  progress: ReadonlyMap<WordId, WordProgressRecord>
  showFormsBar: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll position restore (`spec/tasks/07-words-list.md` §8, acceptance "возврат с карточки
  // слова сохраняет позицию скролла"): read the last saved offset once, on mount, before
  // paint — `useLayoutEffect` (not `useEffect`) so the browser never paints the pre-restore
  // scroll position first. Deliberately read via `getState()` once rather than subscribing —
  // this is a one-shot "where was I" restore, not something that should re-run the effect on
  // every unrelated store update.
  const initialOffsetRef = useRef(useFiltersStore.getState().scrollOffset)

  const rowVirtualizer = useVirtualizer({
    count: words.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WORD_ROW_HEIGHT,
    overscan: 8,
    initialOffset: initialOffsetRef.current,
  })

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (initialOffsetRef.current > 0) {
      el.scrollTop = initialOffsetRef.current
    }

    // Persist the offset continuously while scrolling (not just on unmount) — a `scroll`
    // event fires at most once per animation frame in every real browser, so this is not a
    // per-pixel write storm; `setScrollOffset` itself is a cheap in-memory zustand `set`
    // (not the persisted half of the store — see `filters.store.ts`'s file header).
    const setScrollOffset = useFiltersStore.getState().setScrollOffset
    const handleScroll = () => setScrollOffset(el.scrollTop)
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      handleScroll()
      el.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label="Список слов"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const entry = words[virtualRow.index]!
          const wordId = encodeWordId(entry.lemma, entry.pos)
          return (
            <div
              key={virtualRow.key}
              role="listitem"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <WordRow entry={entry} progress={progress.get(wordId)} showFormsBar={showFormsBar} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
