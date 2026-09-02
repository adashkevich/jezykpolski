/**
 * "Экспорт прогресса" row (`spec/tasks/24-settings-backup.md` §1/§2).
 */
import { Button } from '@/components/ui/button.tsx'
import { LARGE_EXPORT_REVIEW_LOG_THRESHOLD } from '../lib/backup-io.ts'
import { useExportBackup } from '../hooks/useExportBackup.ts'
import { SettingRow } from './SettingRow.tsx'

export function ExportButton() {
  const { state, exportNow } = useExportBackup()

  return (
    <div className="flex flex-col gap-1 py-1">
      <SettingRow label="Экспорт прогресса">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportNow}
          disabled={state.phase === 'exporting'}
        >
          {state.phase === 'exporting' ? 'Экспортируем…' : 'Скачать'}
        </Button>
      </SettingRow>
      {state.phase === 'done' && (
        <p role="status" className="text-xs text-muted-foreground">
          Файл скачан.
          {state.warnLarge &&
            ` История большая (${state.reviewLogsCount.toLocaleString('ru-RU')} записей) — файл может занимать заметный объём.`}
        </p>
      )}
      {state.phase === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          Не удалось экспортировать: {state.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Единственная защита прогресса без облака и аккаунта — сохраните файл в надёжном месте.
        Предупреждение о размере появляется от {LARGE_EXPORT_REVIEW_LOG_THRESHOLD.toLocaleString('ru-RU')} записей истории.
      </p>
    </div>
  )
}
