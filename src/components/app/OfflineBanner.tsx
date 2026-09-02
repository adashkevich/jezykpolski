/**
 * "Нет подключения" strip (`spec/tasks/25-offline-update.md` §4, NFR-01…NFR-03).
 *
 * Deliberately the opposite of a blocking overlay: renders `null` while online, and while
 * offline is a single unobtrusive line, not a modal or a full-width alert bar with heavy
 * styling — offline must never look like an error state, because for this app it isn't one
 * (§4: "офлайн не должен блокировать ничего из учебного цикла"). Its only job is to explain,
 * in passing, why a not-yet-cached paradigm shard might fail to load — the actual per-shard
 * failure message lives in `features/word-detail/components/FormsSection.tsx`, which reads
 * `useOnlineStatus()` itself rather than depending on this component being mounted.
 */
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus.ts'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-1.5 border-b border-border bg-muted px-4 py-1 text-xs text-muted-foreground"
    >
      <WifiOff aria-hidden="true" className="size-3.5 shrink-0" />
      <span>Нет подключения — офлайн-данные доступны, формы незагруженных слов могут быть недоступны</span>
    </div>
  )
}
