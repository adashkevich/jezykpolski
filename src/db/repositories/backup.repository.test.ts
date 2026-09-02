/**
 * `backup.repository.ts` tests (`spec/tasks/24-settings-backup.md` acceptance points 1-6).
 *
 * Uses `paradigmShard: -1` words (no paradigm — `content/paradigms.ts#getParadigm` returns
 * `null` synchronously, no `fetch` mock needed) so `recomputeAll` (called by `applyImport`)
 * runs against the real `enumerateSkills`/`aggregateWord` pipeline without any network
 * involved — same convention `words-progress.repository.test.ts` already established.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../database.ts'
import {
  applyImport,
  buildBackupExport,
  prepareImport,
  resetAllData,
} from './backup.repository.ts'
import { getWordProgressSummary } from './words-progress.repository.ts'
import { get as settingsGet, set as settingsSet } from './settings.repository.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { ReviewLogRecord, SessionRecord, SkillRecord } from '@/types/progress.ts'
import { CURRENT_BACKUP_SCHEMA_VERSION } from '../backup.schema.ts'

function entry(lemma: string, rank: number): WordIndexEntry {
  return {
    lemma,
    pos: 'NOUN',
    rank,
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: -1,
  }
}

function vocabSkill(
  wordId: string,
  dim: 'vocab:pl-ru' | 'vocab:ru-pl',
  stability: number,
): SkillRecord {
  return {
    skillId: `${wordId}::${dim}`,
    wordId,
    kind: 'vocab',
    dimension: dim,
    state: stability > 0 ? 'review' : 'new',
    stability,
    difficulty: 3,
    due: 1000,
    reps: stability > 0 ? 2 : 0,
    lapses: 0,
    correct: 2,
    incorrect: 0,
    createdAt: 500,
    updatedAt: 500,
  }
}

function reviewLog(sessionId: number, skillId: string, wordId: string): ReviewLogRecord {
  return {
    sessionId,
    skillId,
    wordId,
    exerciseType: 'choice',
    reviewedAt: 1000,
    rating: 3,
    correct: true,
    answerGiven: 'kobieta',
    expected: 'kobieta',
    elapsedMs: 1200,
    srsApplied: true,
  }
}

function session(mode: SessionRecord['mode'] = 'learn'): SessionRecord {
  return {
    mode,
    startedAt: 500,
    endedAt: 900,
    totalCount: 2,
    correctCount: 2,
    newSkillCount: 2,
    reviewedSkillCount: 0,
  }
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('buildBackupExport', () => {
  it('carries schemaVersion, contentVersion, and every table except wordProgress', async () => {
    initIndexStore([entry('kobieta', 1)])
    await db.skills.add(vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 30))
    const sessionId = await db.sessions.add(session())
    await db.reviewLogs.add(reviewLog(sessionId as number, 'kobieta|NOUN::vocab:pl-ru', 'kobieta|NOUN'))
    await db.dailyStats.add({
      date: '2026-09-01',
      reviewsCount: 1,
      correctCount: 1,
      newSkillsStarted: 1,
      sessionsCount: 1,
      timeSpentMs: 1200,
      updatedAt: 1000,
    })
    await settingsSet('theme', 'dark')

    const backup = await buildBackupExport('a1b2c3d4e5f6')

    expect(backup.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION)
    expect(backup.contentVersion).toBe('a1b2c3d4e5f6')
    expect(typeof backup.exportedAt).toBe('string')
    expect(backup.skills).toHaveLength(1)
    expect(backup.reviewLogs).toHaveLength(1)
    expect(backup.sessions).toHaveLength(1)
    expect(backup.dailyStats).toHaveLength(1)
    expect(backup.settings).toEqual({ theme: 'dark' })
    expect(backup).not.toHaveProperty('wordProgress')
  })
})

describe('export -> reset -> import round trip (acceptance point 1)', () => {
  it('restores wordProgress aggregates identically after a full reset', async () => {
    const words = ['kobieta', 'rower', 'pies']
    initIndexStore(words.map((w, i) => entry(w, i + 1)))
    const skills: SkillRecord[] = []
    for (const [i, w] of words.entries()) {
      const wordId = `${w}|NOUN`
      skills.push(vocabSkill(wordId, 'vocab:pl-ru', i * 30))
      skills.push(vocabSkill(wordId, 'vocab:ru-pl', i * 20))
    }
    await db.skills.bulkAdd(skills)
    const { recomputeAll } = await import('./words-progress.repository.ts')
    await recomputeAll()
    await settingsSet('dailyNewWordsBudget', 7)

    const before = await getWordProgressSummary()
    expect(before.learningTotal + before.learnedTotal).toBeGreaterThan(0)

    const backup = await buildBackupExport('content-v1')

    await resetAllData()
    const afterReset = await getWordProgressSummary()
    expect(afterReset.learningTotal + afterReset.learnedTotal).toBe(0)
    expect(await db.skills.count()).toBe(0)
    expect(await settingsGet('dailyNewWordsBudget', -1)).toBe(-1)

    const { data } = prepareImport(backup, 'content-v1')
    await applyImport(data, 'content-v1')

    const after = await getWordProgressSummary()
    expect(after).toEqual(before)
    expect(await settingsGet('dailyNewWordsBudget', -1)).toBe(7)
  })
})

describe('prepareImport / applyImport — validation and edge cases (acceptance points 2-6)', () => {
  it('rejects malformed JSON and leaves the DB untouched (acceptance point 2)', async () => {
    initIndexStore([entry('kobieta', 1)])
    await db.skills.add(vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 30))
    const before = await db.skills.toArray()

    expect(() => prepareImport({ not: 'a backup' }, 'v1')).toThrow(/повреждён|неверн/i)
    expect(() => prepareImport('just a string', 'v1')).toThrow()
    expect(() => prepareImport(null, 'v1')).toThrow()

    expect(await db.skills.toArray()).toEqual(before)
  })

  it('rejects an unknown schemaVersion (acceptance point 3)', () => {
    initIndexStore([entry('kobieta', 1)])
    const bogus = {
      schemaVersion: 999,
      exportedAt: new Date().toISOString(),
      contentVersion: 'v1',
      skills: [],
      reviewLogs: [],
      sessions: [],
      dailyStats: [],
      settings: {},
    }
    expect(() => prepareImport(bogus, 'v1')).toThrow(/формата бэкапа/i)
  })

  it('passes with a warning (not a rejection) when contentVersion differs (acceptance point 4)', async () => {
    initIndexStore([entry('kobieta', 1)])
    const backup = await buildBackupExport('old-content-version')

    const { summary } = prepareImport(backup, 'new-content-version')
    expect(summary.contentVersionMismatch).toBe(true)

    // Does not block applyImport either.
    const report = await applyImport(backup, 'new-content-version')
    expect(report.contentVersionMismatch).toBe(true)
  })

  it('skips skills for words no longer in the content index and reports how many (acceptance point 5)', async () => {
    initIndexStore([entry('kobieta', 1)]) // 'rower' deliberately absent from the current index
    const backup = await buildBackupExport('v1')
    // Build a synthetic backup with one skill for a word that still exists and one that doesn't.
    const withGhost = {
      ...backup,
      skills: [
        vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 10),
        vocabSkill('rower|NOUN', 'vocab:pl-ru', 10), // 'rower' not in the index above
      ],
    }

    const { data, summary } = prepareImport(withGhost, 'v1')
    expect(summary.missingWordSkillsCount).toBe(1)
    expect(summary.skillsCount).toBe(2)

    const report = await applyImport(data, 'v1')
    expect(report.skippedSkillsCount).toBe(1)
    expect(report.importedSkillsCount).toBe(1)
    expect(await db.skills.toArray()).toHaveLength(1)
    expect((await db.skills.toArray())[0]?.wordId).toBe('kobieta|NOUN')
  })

  it('recomputes wordProgress after import (acceptance point 6)', async () => {
    initIndexStore([entry('kobieta', 1)])
    const backup = await buildBackupExport('v1')
    const withSkill = {
      ...backup,
      skills: [vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 60), vocabSkill('kobieta|NOUN', 'vocab:ru-pl', 60)],
    }

    expect(await db.wordProgress.count()).toBe(0)
    const { data } = prepareImport(withSkill, 'v1')
    await applyImport(data, 'v1')

    const progress = await db.wordProgress.get('kobieta|NOUN')
    expect(progress).toBeDefined()
    expect(progress?.status).toBe('mastered')
  })

  it('replaces existing data transactionally — old rows are gone, only imported rows remain', async () => {
    initIndexStore([entry('kobieta', 1)])
    await db.skills.add(vocabSkill('kobieta|NOUN', 'vocab:ru-pl', 5))
    const sessionId = await db.sessions.add(session())
    await db.reviewLogs.add(reviewLog(sessionId as number, 'kobieta|NOUN::vocab:ru-pl', 'kobieta|NOUN'))

    const emptyBackup = {
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      contentVersion: 'v1',
      skills: [],
      reviewLogs: [],
      sessions: [],
      dailyStats: [],
      settings: {},
    }
    const { data } = prepareImport(emptyBackup, 'v1')
    await applyImport(data, 'v1')

    expect(await db.skills.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
  })
})

describe('resetAllData (acceptance point 7 setup, FR-132)', () => {
  it('clears every learning-data table but leaves meta.contentVersion untouched', async () => {
    initIndexStore([entry('kobieta', 1)])
    await db.skills.add(vocabSkill('kobieta|NOUN', 'vocab:pl-ru', 30))
    const sessionId = await db.sessions.add(session())
    await db.reviewLogs.add(reviewLog(sessionId as number, 'kobieta|NOUN::vocab:pl-ru', 'kobieta|NOUN'))
    await db.dailyStats.add({
      date: '2026-09-01',
      reviewsCount: 1,
      correctCount: 1,
      newSkillsStarted: 1,
      sessionsCount: 1,
      timeSpentMs: 1000,
      updatedAt: 1000,
    })
    await settingsSet('theme', 'dark')
    await db.meta.put({ key: 'contentVersion', value: 'a1b2c3d4e5f6' })
    const { recomputeAll } = await import('./words-progress.repository.ts')
    await recomputeAll()
    expect(await db.wordProgress.count()).toBeGreaterThan(0)

    await resetAllData()

    expect(await db.skills.count()).toBe(0)
    expect(await db.wordProgress.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    expect(await db.sessions.count()).toBe(0)
    expect(await db.dailyStats.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
    expect(await db.meta.get('contentVersion')).toEqual({
      key: 'contentVersion',
      value: 'a1b2c3d4e5f6',
    })
  })
})
