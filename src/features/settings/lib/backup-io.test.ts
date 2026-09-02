import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LARGE_EXPORT_REVIEW_LOG_THRESHOLD,
  downloadBackupFile,
  readBackupFileAsJson,
  shouldWarnAboutExportSize,
} from './backup-io.ts'
import type { BackupExport } from '@/db/backup.schema.ts'
import { CURRENT_BACKUP_SCHEMA_VERSION } from '@/db/backup.schema.ts'

function makeBackup(overrides: Partial<BackupExport> = {}): BackupExport {
  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-09-01T12:00:00.000Z',
    contentVersion: 'a1b2c3d4e5f6',
    skills: [],
    reviewLogs: [],
    sessions: [],
    dailyStats: [],
    settings: {},
    ...overrides,
  }
}

describe('shouldWarnAboutExportSize', () => {
  it('is false under the threshold', () => {
    const backup = makeBackup({
      reviewLogs: Array.from({ length: LARGE_EXPORT_REVIEW_LOG_THRESHOLD - 1 }, () => ({
        sessionId: 1,
        skillId: 's',
        wordId: 'w',
        exerciseType: 'choice',
        reviewedAt: 1,
        rating: 3 as const,
        correct: true,
        answerGiven: 'a',
        expected: 'a',
        elapsedMs: 1,
        srsApplied: true,
      })),
    })
    expect(shouldWarnAboutExportSize(backup)).toBe(false)
  })

  it('is true at/above the threshold', () => {
    const row = {
      sessionId: 1,
      skillId: 's',
      wordId: 'w',
      exerciseType: 'choice',
      reviewedAt: 1,
      rating: 3 as const,
      correct: true,
      answerGiven: 'a',
      expected: 'a',
      elapsedMs: 1,
      srsApplied: true,
    }
    const backup = makeBackup({
      reviewLogs: Array.from({ length: LARGE_EXPORT_REVIEW_LOG_THRESHOLD }, () => row),
    })
    expect(shouldWarnAboutExportSize(backup)).toBe(true)
  })
})

describe('readBackupFileAsJson', () => {
  it('parses a well-formed JSON file', async () => {
    const file = new File([JSON.stringify({ a: 1 })], 'backup.json', {
      type: 'application/json',
    })
    expect(await readBackupFileAsJson(file)).toEqual({ a: 1 })
  })

  it('rejects a corrupt (non-JSON) file with a friendly Russian error, not a raw SyntaxError', async () => {
    const file = new File(['{ not valid json'], 'broken.json', { type: 'application/json' })
    await expect(readBackupFileAsJson(file)).rejects.toThrow(/не удалось прочитать файл/i)
  })
})

describe('downloadBackupFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL and clicks a download anchor with a .json filename', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadBackupFile(makeBackup())

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })
})
