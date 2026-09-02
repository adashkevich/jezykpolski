/**
 * Shared "build + download the backup" action (`spec/tasks/24-settings-backup.md` §2) — used
 * both by `../components/ExportButton.tsx` (the "Экспорт прогресса" row) and
 * `../components/ResetControl.tsx` ("сначала сделайте экспорт", task text §4), so the two
 * call sites can't drift on what "export" actually does.
 */
import { useState } from 'react'
import { useContent } from '@/app/providers/content-context.ts'
import { buildBackupExport } from '@/db/repositories/backup.repository.ts'
import { downloadBackupFile, shouldWarnAboutExportSize } from '../lib/backup-io.ts'

export type ExportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'exporting' }
  | { readonly phase: 'done'; readonly reviewLogsCount: number; readonly warnLarge: boolean }
  | { readonly phase: 'error'; readonly message: string }

export function useExportBackup(): { state: ExportState; exportNow: () => Promise<void> } {
  const { manifest } = useContent()
  const [state, setState] = useState<ExportState>({ phase: 'idle' })

  async function exportNow() {
    setState({ phase: 'exporting' })
    try {
      const backup = await buildBackupExport(manifest.contentVersion)
      downloadBackupFile(backup)
      setState({
        phase: 'done',
        reviewLogsCount: backup.reviewLogs.length,
        warnLarge: shouldWarnAboutExportSize(backup),
      })
    } catch (error: unknown) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { state, exportNow }
}
