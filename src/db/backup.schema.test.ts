/**
 * `backup.schema.ts` tests (`spec/requirements.md` NFR-16 — "импорт валидируется до записи
 * в БД"). Exercises `parseBackupJson` directly against a variety of untrusted shapes;
 * `backup.repository.test.ts` covers the DB-facing consequences (round trip, atomicity).
 */
import { describe, expect, it } from 'vitest'
import {
  BackupValidationError,
  CURRENT_BACKUP_SCHEMA_VERSION,
  UnknownBackupSchemaVersionError,
  parseBackupJson,
} from './backup.schema.ts'

function validBackup(overrides: Record<string, unknown> = {}) {
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

describe('parseBackupJson', () => {
  it('accepts a well-formed, empty backup', () => {
    const data = parseBackupJson(validBackup())
    expect(data.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION)
  })

  it('accepts a backup with populated tables of the correct shape', () => {
    const data = parseBackupJson(
      validBackup({
        skills: [
          {
            skillId: 'kobieta|NOUN::vocab:pl-ru',
            wordId: 'kobieta|NOUN',
            kind: 'vocab',
            dimension: 'vocab:pl-ru',
            state: 'review',
            stability: 12.5,
            difficulty: 4,
            due: 1735689600000,
            reps: 3,
            lapses: 0,
            correct: 3,
            incorrect: 0,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        reviewLogs: [
          {
            sessionId: 1,
            skillId: 'kobieta|NOUN::vocab:pl-ru',
            wordId: 'kobieta|NOUN',
            exerciseType: 'choice',
            reviewedAt: 3,
            rating: 3,
            correct: true,
            answerGiven: 'kobieta',
            expected: 'kobieta',
            elapsedMs: 900,
            srsApplied: true,
          },
        ],
        sessions: [
          {
            mode: 'learn',
            startedAt: 1,
            endedAt: 2,
            totalCount: 1,
            correctCount: 1,
            newSkillCount: 1,
            reviewedSkillCount: 0,
          },
        ],
        dailyStats: [
          {
            date: '2026-09-01',
            reviewsCount: 1,
            correctCount: 1,
            newSkillsStarted: 1,
            sessionsCount: 1,
            timeSpentMs: 900,
            updatedAt: 3,
          },
        ],
        settings: { theme: 'dark', sessionTargetSize: 20, lastPracticeConfig: { section: 'NOUN' } },
      }),
    )
    expect(data.skills).toHaveLength(1)
    expect(data.settings.lastPracticeConfig).toEqual({ section: 'NOUN' })
  })

  it.each([
    ['not an object', 'a plain string'],
    [42, 'a number'],
    [null, 'null'],
    [[], 'an array'],
    [{}, 'an empty object missing every field'],
    [validBackup({ skills: 'not-an-array' }), 'skills as a non-array'],
    [validBackup({ skills: [{ wordId: 'x|NOUN' }] }), 'a skill missing required fields'],
    [
      validBackup({ skills: [{ skillId: 'x', wordId: 'x|NOUN', kind: 'nonsense', dimension: 'd', state: 'new', stability: 0, difficulty: 0, due: 0, reps: 0, lapses: 0, correct: 0, incorrect: 0, createdAt: 0, updatedAt: 0 }] }),
      'a skill with an invalid kind enum value',
    ],
    [validBackup({ schemaVersion: 'one' }), 'a non-numeric schemaVersion'],
    [validBackup({ settings: ['not', 'an', 'object'] }), 'settings as an array instead of a map'],
  ] as const)('rejects %j (%s) with BackupValidationError, never touching the DB', (bad, description) => {
    expect(() => parseBackupJson(bad), description).toThrow(BackupValidationError)
  })

  it('rejects an unknown schemaVersion with UnknownBackupSchemaVersionError, not a generic validation error', () => {
    expect(() => parseBackupJson(validBackup({ schemaVersion: 2 }))).toThrow(
      UnknownBackupSchemaVersionError,
    )
    expect(() => parseBackupJson(validBackup({ schemaVersion: 0 }))).toThrow(
      UnknownBackupSchemaVersionError,
    )
  })

  it('UnknownBackupSchemaVersionError carries the found/supported versions and a Russian message', () => {
    try {
      parseBackupJson(validBackup({ schemaVersion: 7 }))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownBackupSchemaVersionError)
      const e = error as UnknownBackupSchemaVersionError
      expect(e.foundVersion).toBe(7)
      expect(e.supportedVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION)
      expect(e.message).toMatch(/формата бэкапа/i)
    }
  })
})
