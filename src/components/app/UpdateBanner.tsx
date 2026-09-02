/**
 * "Доступна новая версия → Обновить / Позже" (`spec/tasks/25-offline-update.md` §5, NFR-17).
 *
 * `registerType: 'prompt'` (`vite.config.ts`) means the new service worker installs and sits
 * in `waiting` state until something calls `updateServiceWorker()` — nothing did, until this
 * component. `virtual:pwa-register/react`'s `useRegisterSW()` is the framework-integration
 * entry point `vite-plugin-pwa` ships for exactly this (see its own `node_modules/
 * vite-plugin-pwa/react.d.ts`): it registers the SW on mount (`immediate: true` default) and
 * flips `needRefresh` to `true` once an updated SW has finished installing and is waiting.
 *
 * SESSION-AWARE (task text §5, the whole point of this task over just wiring the library
 * defaults): reloading the page mid-exercise looks like lost progress even though every
 * graded answer is already durably in IndexedDB by the time it's graded
 * (`session.store.ts`'s own header) — the banner simply doesn't render while
 * `useSessionStore`'s `sessionId` is non-null, and reappears on its own once the session
 * ends (`sessionId` goes back to `null`) without the user having to do anything — this is a
 * plain render-time gate, not a one-time "missed it" dismissal.
 *
 * "Позже" is a separate, explicit per-update dismissal on top of that: even with no session
 * active, the user can decline for now. `dismissed` resets whenever `needRefresh` itself
 * goes back to `false` (a fresh registration, or after `updateServiceWorker` actually
 * reloads) so a *future* update still gets its own banner instead of being silently
 * suppressed forever by today's "Позже" click. That reset happens during render — React's own
 * "adjusting state when a prop changes" pattern, same fix `word-detail/hooks/useLazyParadigm.ts`
 * uses for its analogous "external value changed, resync local state" case — rather than as a
 * synchronous `setState` at the top of a `useEffect`, which `react-hooks/set-state-in-effect`
 * flags.
 */
/// <reference types="vite-plugin-pwa/react" />
import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button.tsx'
import { useSessionStore } from '@/stores/session.store.ts'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const sessionActive = useSessionStore((state) => state.sessionId !== null)
  const [dismissed, setDismissed] = useState(false)

  const [lastNeedRefresh, setLastNeedRefresh] = useState(needRefresh)
  if (needRefresh !== lastNeedRefresh) {
    setLastNeedRefresh(needRefresh)
    if (!needRefresh) setDismissed(false)
  }

  if (!needRefresh || dismissed || sessionActive) return null

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-secondary px-4 py-1.5 text-xs text-secondary-foreground"
    >
      <span className="flex items-center gap-1.5">
        <RefreshCw aria-hidden="true" className="size-3.5 shrink-0" />
        Доступна новая версия
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="default"
          size="xs"
          onClick={() => void updateServiceWorker(true)}
        >
          Обновить
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setDismissed(true)}
          aria-label="Позже"
        >
          <X aria-hidden="true" />
          Позже
        </Button>
      </div>
    </div>
  )
}
