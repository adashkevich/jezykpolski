/**
 * Browser-facing glue for export/import (`spec/tasks/24-settings-backup.md` §2/§3) —
 * everything that touches `File`/`Blob`/the DOM download mechanism rather than the DB or
 * Zod validation, which live in `db/backup.schema.ts` + `db/repositories/backup.repository.ts`.
 * Kept separate from those so the actually-important logic (validation, atomicity) has zero
 * dependency on `File`/`Blob`/`URL` existing, and is trivially testable in plain Node/jsdom
 * without a real download ever happening.
 */
import type { BackupExport } from '@/db/backup.schema.ts'

/** Task text §2: "При большом числе `reviewLogs` (десятки тысяч) — предупредить о размере
 *  файла." 20 000 is the task text's own example threshold ("десятки тысяч" = tens of
 *  thousands; 20k is comfortably the start of that range without being so high the warning
 *  never fires for a genuinely large, multi-year history). */
export const LARGE_EXPORT_REVIEW_LOG_THRESHOLD = 20_000

export function shouldWarnAboutExportSize(backup: BackupExport): boolean {
  return backup.reviewLogs.length >= LARGE_EXPORT_REVIEW_LOG_THRESHOLD
}

function backupFileName(backup: BackupExport): string {
  // `exportedAt` is already a sortable ISO string — slicing it to the date gives a
  // filename that sorts correctly alongside other exports without needing its own
  // date-formatting logic.
  const day = backup.exportedAt.slice(0, 10)
  return `polski-backup-${day}.json`
}

/**
 * Task text §2: "Скачивание через Blob + `URL.createObjectURL`." Triggers a real browser
 * download via a detached, immediately-clicked `<a>` — the standard vanilla-JS pattern for
 * "save this in-memory data as a file" with no server round trip. `URL.revokeObjectURL` is
 * deferred (not called synchronously after `click()`) because Firefox has historically
 * needed the object URL to still resolve at the moment the download actually starts, not
 * just at the moment `click()` returns.
 */
export function downloadBackupFile(backup: BackupExport): void {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backupFileName(backup)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Task text §3 step 1: "прочитать файл". Reads `file` as text and `JSON.parse`s it, wrapping
 * a `SyntaxError` (genuinely corrupt/truncated JSON — not the same failure mode as
 * `backup.schema.ts#parseBackupJson`'s "valid JSON, wrong shape") in the same friendly,
 * Russian, "не трогает БД" framing NFR-16 asks for everywhere else in the import pipeline —
 * a caller doesn't need to special-case "JSON.parse threw" vs. "Zod rejected the shape",
 * both already read as plain `Error`s with a human message by the time they reach the UI.
 */
export async function readBackupFileAsJson(file: File): Promise<unknown> {
  const text = await file.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `Не удалось прочитать файл «${file.name}» — это не похоже на корректный JSON. ` +
        `Выберите файл, полученный через «Экспорт прогресса» в этом приложении.`,
    )
  }
}
