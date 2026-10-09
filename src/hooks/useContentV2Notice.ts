/**
 * Live `meta.contentV2Notice` (task 49 §1) — the one-time "dictionary updated" notice the
 * `content-v2-level-reset` startup step leaves for the home screen's banner
 * (`features/content-update/components/ContentV2Notice.tsx`).
 *
 * `undefined` while the query is loading, `null` when there is no notice (never written, or
 * already dismissed). Live, because the step runs at startup and may well finish AFTER the home
 * screen has mounted — the banner then appears by itself.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { getContentV2Notice, type ContentV2Notice } from '@/db/repositories/meta.repository.ts'

export function useContentV2Notice(): ContentV2Notice | null | undefined {
  return useLiveQuery(async () => (await getContentV2Notice()) ?? null, [])
}
