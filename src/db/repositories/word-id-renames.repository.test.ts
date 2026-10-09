/**
 * Task 48 (`spec/tasks/48-progress-migration-word-id-renames.md`, acceptance) on a real Dexie
 * database (fake-indexeddb): the `word-id-renames-v2` startup step and the import of a backup
 * exported before the update.
 *
 * The content index is the v2 one — old ids (`to|NOUN`, `spocić|VERB`, `dziś|NOUN`, …) are NOT
 * in it, exactly like in production after the update. `spocić się|VERB` has a paradigm (shard
 * 0, served by a stubbed `fetch`) — the alias paradigm task 47 gives reflexive verbs; `to|PRON`,
 * `co|PRON`, `dziś|ADV` and `kobieta|NOUN` have none (`paradigmShard: -1`), so only the three
 * vocab dimensions exist for them. The rename map is the real `data/word-id-renames.json`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeForm, type PosValue } from '@/content/codec.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import { kindOfDimension } from '@/learning/skills/enumerate.ts'
import { encodeSkillId, encodeWordId, type WordId } from '@/learning/skills/skill-id.ts'
import { uniformLevels } from '@/test/fixtures/levels.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'
import { db } from '../database.ts'
import { applyImport, buildBackupExport, prepareImport, resetAllData } from './backup.repository.ts'
import { runOnce } from './meta.repository.ts'
import {
  applyWordIdRenamesToDatabase,
  runWordIdRenamesMigration,
} from './word-id-renames.repository.ts'

// --- v2 content fixture --------------------------------------------------------------------

function entry(lemma: string, pos: PosValue, rank: number, paradigmShard: number): WordIndexEntry {
  return {
    lemma,
    pos,
    rank,
    level: 'A1',
    levels: uniformLevels('A1'),
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard,
  }
}

const SPOCIC_SIE = encodeWordId('spocić się', 'VERB')
const TO_PRON = encodeWordId('to', 'PRON')
const CO_PRON = encodeWordId('co', 'PRON')
const DZIS_ADV = encodeWordId('dziś', 'ADV')
const KOBIETA = encodeWordId('kobieta', 'NOUN')
// Old (v1) ids — keys of `data/word-id-renames.json`, absent from the v2 index.
const SPOCIC = encodeWordId('spocić', 'VERB')
const TO_NOUN = encodeWordId('to', 'NOUN')
const CO_NOUN = encodeWordId('co', 'NOUN')
const DZIS_NOUN = encodeWordId('dziś', 'NOUN')

const V2_INDEX = [
  entry('spocić się', 'VERB', 1, 0),
  entry('to', 'PRON', 2, -1),
  entry('co', 'PRON', 3, -1),
  entry('dziś', 'ADV', 4, -1),
  entry('kobieta', 'NOUN', 5, -1),
]

/** `paradigms/000.json`: `spocić się|VERB` conjugates in `verb:future:1:sg` and
 *  `verb:past:1:sg:masculine` (the infinitive is no dimension). */
const PARADIGM_SHARD_0 = {
  [SPOCIC_SIE]: {
    forms: [
      encodeForm({ form: 'spocić', mood: 'infinitive', aspect: 'perfective' }),
      encodeForm({
        form: 'spocę',
        mood: 'indicative',
        tense: 'future',
        person: 1,
        number: 'singular',
        aspect: 'perfective',
      }),
      encodeForm({
        form: 'spociłem',
        mood: 'indicative',
        tense: 'past',
        person: 1,
        number: 'singular',
        gender: 'masculine',
        aspect: 'perfective',
      }),
    ],
  },
}

function makeFetchMock(routes: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url)
    const key = Object.keys(routes).find((k) => href.includes(k))
    if (key === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response
    return { ok: true, json: async () => routes[key] } as Response
  })
}

// --- v1 progress fixture -------------------------------------------------------------------

function skill(
  wordId: WordId,
  dimension: Dimension,
  overrides: Partial<SkillRecord> = {},
): SkillRecord {
  return {
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    kind: kindOfDimension(dimension),
    dimension,
    state: 'review',
    stability: 10,
    difficulty: 5,
    due: 50_000,
    lastReviewAt: 1_000,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 100,
    updatedAt: 1_000,
    ...overrides,
  }
}

function log(wordId: WordId, dimension: Dimension, reviewedAt: number): ReviewLogRecord {
  return {
    sessionId: 1,
    skillId: encodeSkillId(wordId, dimension),
    wordId,
    exerciseType: 'choice',
    reviewedAt,
    rating: 3,
    correct: true,
    answerGiven: 'x',
    expected: 'x',
    elapsedMs: 900,
    srsApplied: true,
  }
}

const V1_SKILLS: SkillRecord[] = [
  skill(SPOCIC, 'verb:future:1:sg', {
    stability: 7.5,
    difficulty: 4.2,
    due: 123_456,
    state: 'relearning',
    reps: 4,
    lapses: 1,
    lastReviewAt: 1_111,
    correct: 4,
    incorrect: 1,
    correctStreak: 2,
  }),
  skill(SPOCIC, 'vocab:pl-ru', { stability: 21, due: 222_222, reps: 6, correct: 6 }),
  skill(TO_NOUN, 'noun:sg:genitive', { stability: 3 }),
  skill(TO_NOUN, 'vocab:pl-ru', { stability: 15, due: 77_777, reps: 5 }),
  skill(DZIS_NOUN, 'vocab:pl-ru', {
    state: 'review',
    reps: 5,
    stability: 12,
    due: 99_999,
    correct: 4,
    incorrect: 1,
    correctStreak: 3,
  }),
  skill(DZIS_ADV, 'vocab:pl-ru', {
    state: 'new',
    reps: 0,
    stability: 0,
    lastReviewAt: undefined,
    correct: 1,
    incorrect: 2,
    correctStreak: 0,
  }),
  skill(KOBIETA, 'vocab:pl-ru'),
]

const V1_LOGS: ReviewLogRecord[] = [
  log(SPOCIC, 'verb:future:1:sg', 1_001),
  log(TO_NOUN, 'noun:sg:genitive', 1_002),
  log(TO_NOUN, 'vocab:pl-ru', 1_003),
  log(DZIS_NOUN, 'vocab:pl-ru', 1_004),
  log(KOBIETA, 'vocab:pl-ru', 1_005),
  // `co|NOUN` was reset on the word card (`resetWord` deletes skills, keeps logs) — a log
  // with no skill behind it still moves.
  log(CO_NOUN, 'vocab:pl-ru', 1_006),
]

async function seedV1(): Promise<void> {
  await db.skills.bulkAdd(V1_SKILLS)
  await db.reviewLogs.bulkAdd(V1_LOGS)
  // Stale cache rows under old ids, as left by v1.
  await db.wordProgress.bulkAdd([
    { wordId: TO_NOUN, status: 'learning', vocabMaturity: 0.3, morphMaturity: 0, updatedAt: 1 },
    { wordId: SPOCIC, status: 'learning', vocabMaturity: 0.3, morphMaturity: 0, updatedAt: 1 },
  ])
}

async function snapshot() {
  const skills = (await db.skills.toArray()).sort((a, b) => a.skillId.localeCompare(b.skillId))
  const reviewLogs = (await db.reviewLogs.toArray()).sort((a, b) => a.id! - b.id!)
  // `updatedAt` is `Date.now()` of whichever recompute wrote the row — not part of the state.
  const wordProgress = (await db.wordProgress.toArray())
    .map((row) => ({ ...row, updatedAt: 0 }))
    .sort((a, b) => a.wordId.localeCompare(b.wordId))
  return { skills, reviewLogs, wordProgress }
}

function logBy(reviewLogs: readonly ReviewLogRecord[], reviewedAt: number): ReviewLogRecord {
  const found = reviewLogs.find((l) => l.reviewedAt === reviewedAt)
  if (!found) throw new Error(`no log reviewed at ${reviewedAt}`)
  return found
}

let fetchMock: ReturnType<typeof makeFetchMock>

beforeEach(async () => {
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  initIndexStore(V2_INDEX)
  fetchMock = makeFetchMock({ 'paradigms/000.json': PARADIGM_SHARD_0 })
  vi.stubGlobal('fetch', fetchMock)
  await db.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await db.delete()
})

// --- in-place step -------------------------------------------------------------------------

describe('applyWordIdRenamesToDatabase — the word-id-renames-v2 step', () => {
  it('spocić|VERB → spocić się|VERB: the same FSRS fields under the new skillId, old records gone', async () => {
    await seedV1()

    await applyWordIdRenamesToDatabase()

    for (const old of V1_SKILLS.filter((s) => s.wordId === SPOCIC)) {
      const moved = await db.skills.get(encodeSkillId(SPOCIC_SIE, old.dimension as Dimension))
      expect(moved).toEqual({
        ...old,
        skillId: encodeSkillId(SPOCIC_SIE, old.dimension as Dimension),
        wordId: SPOCIC_SIE,
      })
    }
    expect(await db.skills.where('wordId').equals(SPOCIC).count()).toBe(0)
    expect(await db.skills.get(encodeSkillId(SPOCIC, 'verb:future:1:sg'))).toBeUndefined()
  })

  it('to|NOUN::noun:sg:genitive is dropped, to|NOUN::vocab:pl-ru → to|PRON::vocab:pl-ru', async () => {
    await seedV1()

    const report = await applyWordIdRenamesToDatabase()

    expect(await db.skills.get(encodeSkillId(TO_NOUN, 'noun:sg:genitive'))).toBeUndefined()
    expect(await db.skills.get(encodeSkillId(TO_PRON, 'noun:sg:genitive'))).toBeUndefined()
    const vocabBefore = V1_SKILLS.find((s) => s.skillId === encodeSkillId(TO_NOUN, 'vocab:pl-ru'))!
    expect(await db.skills.get(encodeSkillId(TO_PRON, 'vocab:pl-ru'))).toEqual({
      ...vocabBefore,
      skillId: encodeSkillId(TO_PRON, 'vocab:pl-ru'),
      wordId: TO_PRON,
    })
    expect(await db.skills.where('wordId').equals(TO_NOUN).count()).toBe(0)
    // 5 old-id skills: 4 moved (one of them merged), 1 dropped; 4 logs rewritten.
    expect(report).toEqual({ movedSkills: 4, droppedSkills: 1, rewrittenLogs: 4 })
  })

  it('merge: dziś|NOUN (review, reps 5) + dziś|ADV (new) → dziś|ADV review, reps 5, correct summed', async () => {
    await seedV1()

    await applyWordIdRenamesToDatabase()

    const merged = await db.skills.get(encodeSkillId(DZIS_ADV, 'vocab:pl-ru'))
    expect(merged).toMatchObject({
      wordId: DZIS_ADV,
      state: 'review',
      reps: 5,
      stability: 12,
      due: 99_999,
      correct: 4 + 1,
      incorrect: 1 + 2,
      correctStreak: 3,
    })
    expect(await db.skills.where('wordId').equals(DZIS_NOUN).count()).toBe(0)
    expect(await db.skills.where('wordId').equals(DZIS_ADV).count()).toBe(1)
  })

  it('review logs are rewritten; logs of dropped dimensions stay in place with their old ids', async () => {
    await seedV1()
    const idsBefore = (await db.reviewLogs.toArray()).map((l) => l.id).sort()

    await applyWordIdRenamesToDatabase()

    const logs = await db.reviewLogs.toArray()
    expect(logs.map((l) => l.id).sort()).toEqual(idsBefore)
    expect(logBy(logs, 1_001)).toMatchObject({
      wordId: SPOCIC_SIE,
      skillId: encodeSkillId(SPOCIC_SIE, 'verb:future:1:sg'),
    })
    expect(logBy(logs, 1_002)).toMatchObject({
      wordId: TO_NOUN,
      skillId: encodeSkillId(TO_NOUN, 'noun:sg:genitive'),
    })
    expect(logBy(logs, 1_003)).toMatchObject({
      wordId: TO_PRON,
      skillId: encodeSkillId(TO_PRON, 'vocab:pl-ru'),
    })
    expect(logBy(logs, 1_004)).toMatchObject({
      wordId: DZIS_ADV,
      skillId: encodeSkillId(DZIS_ADV, 'vocab:pl-ru'),
    })
    expect(logBy(logs, 1_005)).toMatchObject({
      wordId: KOBIETA,
      skillId: encodeSkillId(KOBIETA, 'vocab:pl-ru'),
    })
    expect(logBy(logs, 1_006)).toMatchObject({
      wordId: CO_PRON,
      skillId: encodeSkillId(CO_PRON, 'vocab:pl-ru'),
    })
    // Every other field of a rewritten log is untouched.
    expect(logBy(logs, 1_001)).toMatchObject({
      ...V1_LOGS[0],
      wordId: SPOCIC_SIE,
      skillId: encodeSkillId(SPOCIC_SIE, 'verb:future:1:sg'),
    })
  })

  it('a second run changes nothing (idempotency)', async () => {
    await seedV1()
    await applyWordIdRenamesToDatabase()
    const afterFirst = await snapshot()

    const report = await applyWordIdRenamesToDatabase()

    expect(report).toEqual({ movedSkills: 0, droppedSkills: 0, rewrittenLogs: 0 })
    expect(await snapshot()).toEqual(afterFirst)
  })

  it('an empty database is a no-op — nothing written, no paradigm fetched', async () => {
    const report = await applyWordIdRenamesToDatabase()

    expect(report).toEqual({ movedSkills: 0, droppedSkills: 0, rewrittenLogs: 0 })
    expect(await db.skills.count()).toBe(0)
    expect(await db.reviewLogs.count()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('progress without any renamed word is a no-op — rows unchanged, no paradigm fetched', async () => {
    await db.skills.bulkAdd([skill(KOBIETA, 'vocab:pl-ru'), skill(DZIS_ADV, 'vocab:ru-pl-choice')])
    await db.reviewLogs.bulkAdd([log(KOBIETA, 'vocab:pl-ru', 2_000)])
    const before = await snapshot()

    const report = await applyWordIdRenamesToDatabase()

    expect(report).toEqual({ movedSkills: 0, droppedSkills: 0, rewrittenLogs: 0 })
    expect(await snapshot()).toEqual(before)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('runOnce("word-id-renames-v2", runWordIdRenamesMigration)', () => {
  it('migrates, logs the counts, rebuilds wordProgress and removes the rows of vanished ids', async () => {
    await seedV1()
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    expect(await runOnce('word-id-renames-v2', runWordIdRenamesMigration)).toBe(true)

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0]![0]).toMatch(/перенесено навыков — 4.*отброшено.*— 1.*логов — 4/)
    const progressIds = (await db.wordProgress.toArray()).map((p) => p.wordId).sort()
    expect(progressIds).toEqual([DZIS_ADV, KOBIETA, SPOCIC_SIE, TO_PRON].sort())
    expect(await db.meta.get('once:word-id-renames-v2')).toBeDefined()

    // Recorded: the next start doesn't run it again.
    expect(await runOnce('word-id-renames-v2', runWordIdRenamesMigration)).toBe(false)
  })

  it('a paradigm that cannot be loaded (offline) fails the step: DB untouched, key not recorded, retried next start', async () => {
    await seedV1()
    const before = await snapshot()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )

    await expect(runOnce('word-id-renames-v2', runWordIdRenamesMigration)).rejects.toThrow(
      'Failed to fetch',
    )

    expect(await snapshot()).toEqual(before)
    expect(await db.meta.get('once:word-id-renames-v2')).toBeUndefined()

    // Back online on the next start.
    vi.stubGlobal('fetch', makeFetchMock({ 'paradigms/000.json': PARADIGM_SHARD_0 }))
    expect(await runOnce('word-id-renames-v2', runWordIdRenamesMigration)).toBe(true)
    expect(await db.skills.where('wordId').equals(SPOCIC_SIE).count()).toBe(2)
  })

  it('content index not loaded: fails loudly without touching the DB', async () => {
    await seedV1()
    const before = await snapshot()
    __resetIndexStoreForTest()

    await expect(runOnce('word-id-renames-v2', runWordIdRenamesMigration)).rejects.toThrow()

    expect(await snapshot()).toEqual(before)
    expect(await db.meta.get('once:word-id-renames-v2')).toBeUndefined()
  })
})

// --- backup import -------------------------------------------------------------------------

describe('importing a backup exported on v1 (spec §3)', () => {
  it('yields the same state as the in-place migration, and the summary counts moved/dropped', async () => {
    await seedV1()
    const v1Backup: unknown = JSON.parse(JSON.stringify(await buildBackupExport('content-v1')))

    await runWordIdRenamesMigration()
    const inPlace = await snapshot()

    await resetAllData()
    const { data, summary } = await prepareImport(v1Backup, 'content-v2')
    expect(summary.renamedSkillsCount).toBe(4)
    expect(summary.droppedRenamedSkillsCount).toBe(1)
    expect(summary.missingWordSkillsCount).toBe(0)
    expect(summary.skillsCount).toBe(inPlace.skills.length)
    const report = await applyImport(data, 'content-v2')
    expect(report.skippedSkillsCount).toBe(0)

    expect(await snapshot()).toEqual(inPlace)
  })

  it('a backup without renamed ids passes through unchanged, counts are zero', async () => {
    await db.skills.bulkAdd([skill(KOBIETA, 'vocab:pl-ru')])
    const backup: unknown = JSON.parse(JSON.stringify(await buildBackupExport('content-v2')))

    const { data, summary } = await prepareImport(backup, 'content-v2')

    expect(summary.renamedSkillsCount).toBe(0)
    expect(summary.droppedRenamedSkillsCount).toBe(0)
    expect(data.skills).toEqual([skill(KOBIETA, 'vocab:pl-ru')])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
