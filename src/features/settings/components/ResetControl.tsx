/**
 * "Сбросить учебные данные" row (`spec/tasks/24-settings-backup.md` §1/§4, FR-132).
 *
 * Two-step confirmation via an explicit checkbox (task text: "ввод подтверждающего слова
 * ИЛИ явным чекбоксом — выбери проще для мобильного" — a checkbox needs no on-screen
 * keyboard and no exact-text matching, both meaningfully worse on a phone). Step 1: clicking
 * "Сбросить" reveals the confirmation panel below (nothing destructive has happened yet).
 * Step 2: the panel's own "Сбросить всё" button is disabled until the checkbox is checked —
 * two genuinely separate taps, not one dialog with a single "ОК".
 *
 * Also surfaces "сначала сделайте экспорт" (task text §4) as an actual working button, via
 * the same `useExportBackup` hook `ExportButton.tsx` uses — not just a suggestion in prose.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { resetAllData } from '@/db/repositories/backup.repository.ts'
import { useExportBackup } from '../hooks/useExportBackup.ts'
import { SettingRow } from './SettingRow.tsx'

type ResetState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'confirming' }
  | { readonly phase: 'resetting' }
  | { readonly phase: 'done' }
  | { readonly phase: 'error'; readonly message: string }

export function ResetControl() {
  const [state, setState] = useState<ResetState>({ phase: 'idle' })
  const [confirmed, setConfirmed] = useState(false)
  const { state: exportState, exportNow } = useExportBackup()

  async function handleReset() {
    setState({ phase: 'resetting' })
    try {
      await resetAllData()
      setState({ phase: 'done' })
      setConfirmed(false)
    } catch (error: unknown) {
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <SettingRow label="Сбросить учебные данные">
        {state.phase === 'idle' || state.phase === 'error' ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setState({ phase: 'confirming' })}
          >
            Сбросить
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            {state.phase === 'resetting' && 'Сбрасываем…'}
            {state.phase === 'done' && 'Сброшено'}
            {state.phase === 'confirming' && ' '}
          </span>
        )}
      </SettingRow>

      {state.phase === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}

      {state.phase === 'confirming' && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-foreground">
            Будут удалены все навыки, история повторений, сессии и статистика. Это необратимо.
          </p>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={exportNow}>
            Сначала экспортировать
          </Button>
          {exportState.phase === 'done' && (
            <p role="status" className="text-xs text-muted-foreground">
              Файл экспорта скачан.
            </p>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="size-5 shrink-0 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            Я понимаю, что все данные будут удалены безвозвратно
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!confirmed}
              onClick={handleReset}
            >
              Сбросить всё
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setState({ phase: 'idle' })
                setConfirmed(false)
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
