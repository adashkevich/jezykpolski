/**
 * "Импорт прогресса" row (`spec/tasks/24-settings-backup.md` §1/§3) — implements the task
 * text's 8-step order end to end:
 *
 *  1. read the file          -> `readBackupFileAsJson` (file input's `onChange`)
 *  2-3. validate + version   -> `prepareImport` (throws `BackupValidationError` /
 *                                `UnknownBackupSchemaVersionError`, both from
 *                                `db/backup.schema.ts`, surfaced as `phase: 'error'`)
 *  4. show summary           -> `phase: 'confirm'` renders `summary` below
 *  5. user confirmation      -> the "Импортировать" button in that same panel
 *  6-7. transactional replace
 *       + recomputeAll       -> `applyImport` (only called from step 5's click handler)
 *  8. report                 -> `phase: 'done'` renders `report`
 *
 * Nothing before step 5 ever calls `applyImport` — `prepareImport` (steps 2-4) is read-only,
 * so picking a file and seeing its summary never touches the DB even if the user backs out.
 */
import { useRef, useState } from 'react'
import { useContent } from '@/app/providers/content-context.ts'
import { Button } from '@/components/ui/button.tsx'
import type { BackupExport } from '@/db/backup.schema.ts'
import {
  applyImport,
  prepareImport,
  type ImportReport,
  type ImportSummary,
} from '@/db/repositories/backup.repository.ts'
import { readBackupFileAsJson } from '../lib/backup-io.ts'
import { SettingRow } from './SettingRow.tsx'

type ImportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'error'; readonly message: string }
  | { readonly phase: 'confirm'; readonly data: BackupExport; readonly summary: ImportSummary }
  | { readonly phase: 'importing' }
  | { readonly phase: 'done'; readonly report: ImportReport }

export function ImportControl() {
  const { manifest } = useContent()
  const [state, setState] = useState<ImportState>({ phase: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChosen(file: File) {
    try {
      const raw = await readBackupFileAsJson(file)
      const { data, summary } = prepareImport(raw, manifest.contentVersion)
      setState({ phase: 'confirm', data, summary })
    } catch (error: unknown) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function confirmImport() {
    if (state.phase !== 'confirm') return
    setState({ phase: 'importing' })
    try {
      const report = await applyImport(state.data, manifest.contentVersion)
      setState({ phase: 'done', report })
    } catch (error: unknown) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function reset() {
    setState({ phase: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <SettingRow label="Импорт прогресса">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={state.phase === 'importing'}
        >
          Выбрать файл
        </Button>
      </SettingRow>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Выбрать файл резервной копии"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFileChosen(file)
        }}
      />

      {state.phase === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}

      {state.phase === 'confirm' && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-sm text-foreground">
            Будет импортировано {state.summary.skillsCount.toLocaleString('ru-RU')} навыков,{' '}
            {state.summary.reviewLogsCount.toLocaleString('ru-RU')} записей истории. Текущий
            прогресс будет заменён.
          </p>
          {state.summary.missingWordSkillsCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {state.summary.missingWordSkillsCount.toLocaleString('ru-RU')} навыков ссылаются
              на слова, которых больше нет в текущей базе, — они будут пропущены.
            </p>
          )}
          {state.summary.contentVersionMismatch && (
            <p className="text-xs text-warning">
              Файл экспортирован из другой версии контента ({state.summary.importedContentVersion
                || '—'}
              , сейчас {state.summary.currentContentVersion || '—'}). Это не мешает импорту —
              идентификаторы слов стабильны.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirmImport}>
              Импортировать
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'importing' && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          Импортируем…
        </p>
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <p role="status" className="text-sm text-foreground">
            Готово: импортировано {state.report.importedSkillsCount.toLocaleString('ru-RU')}{' '}
            навыков, {state.report.importedReviewLogsCount.toLocaleString('ru-RU')} записей
            истории.
          </p>
          {state.report.skippedSkillsCount > 0 && (
            <p>Пропущено (слова больше не в базе): {state.report.skippedSkillsCount}</p>
          )}
          {state.report.contentVersionMismatch && <p>Импортировано из другой версии контента.</p>}
          <Button type="button" variant="ghost" size="sm" className="mt-1 self-start" onClick={reset}>
            Ок
          </Button>
        </div>
      )}
    </div>
  )
}
