/**
 * `confusion.repository.ts` tests (`spec/tasks/27-context-and-error-analysis.md` §1).
 *
 * Uses the exact `kobieta` example the task text itself illustrates: genitive sg
 * `"kobiety"`, dative/locative sg both `"kobiecie"` (real Polish declension — dative and
 * locative singular of `kobieta` genuinely coincide, per its i-stem feminine paradigm) —
 * this is also what exercises the "ambiguous match, don't attribute" rule (step 5): an
 * answer of `"kobiecie"` for a `genitive` question matches BOTH `dative` and `locative`,
 * so it must not be silently attributed to either one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database.ts'
import {
  CONFUSION_SIGNIFICANCE_THRESHOLD,
  getConfusionMatrix,
} from './confusion.repository.ts'
import { encodeForm, type EncodedForm } from '@/content/codec.ts'
import { __resetIndexStoreForTest, initIndexStore } from '@/content/index-store.ts'
import { __resetLoaderCachesForTest } from '@/content/loader.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'

function indexEntry(
  overrides: Partial<WordIndexEntry> & Pick<WordIndexEntry, 'lemma' | 'pos'>,
): WordIndexEntry {
  return {
    rank: 1,
    level: 'A1',
    primaryRu: 'x',
    sensesShard: 0,
    paradigmShard: -1,
    ...overrides,
  }
}

/** Real singular declension of `kobieta|NOUN` (nominative/genitive/dative/accusative/
 *  instrumental/locative/vocative) — dative and locative both genuinely resolve to
 *  `"kobiecie"`. Plural is omitted: nothing in these tests needs it. */
function kobietaSingularForms(): EncodedForm[] {
  const table: Record<string, string> = {
    nominative: 'kobieta',
    genitive: 'kobiety',
    dative: 'kobiecie',
    accusative: 'kobietę',
    instrumental: 'kobietą',
    locative: 'kobiecie',
    vocative: 'kobieto',
  }
  return Object.entries(table).map(([caseValue, form]) =>
    encodeForm({ form, number: 'singular', case: caseValue as never }),
  )
}

function log(overrides: Partial<ReviewLogRecord> & Pick<ReviewLogRecord, 'skillId' | 'answerGiven'>): ReviewLogRecord {
  return {
    sessionId: 1,
    wordId: 'kobieta|NOUN',
    exerciseType: 'form-choice',
    reviewedAt: 0,
    rating: 1,
    correct: false,
    expected: 'x',
    elapsedMs: 1000,
    srsApplied: true,
    ...overrides,
  }
}

function stubParadigmFetch(shardJson: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => shardJson }) as Response),
  )
}

beforeEach(async () => {
  __resetIndexStoreForTest()
  __resetLoaderCachesForTest()
  await db.open()
})

afterEach(async () => {
  await db.delete()
  vi.unstubAllGlobals()
})

const KOBIETA_ID = encodeWordId('kobieta', 'NOUN')
const GENITIVE_SKILL = encodeSkillId(KOBIETA_ID, 'noun:sg:genitive')
const LOCATIVE_SKILL = encodeSkillId(KOBIETA_ID, 'noun:sg:locative')

describe('getConfusionMatrix', () => {
  it('returns nothing below the significance threshold', async () => {
    initIndexStore([indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 })])
    stubParadigmFetch({ 'kobieta|NOUN': { forms: kobietaSingularForms() } })

    // 2 wrong logs, one below CONFUSION_SIGNIFICANCE_THRESHOLD (3).
    expect(CONFUSION_SIGNIFICANCE_THRESHOLD).toBe(3)
    await db.reviewLogs.bulkAdd([
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 1 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 2 }),
    ])

    expect(await getConfusionMatrix()).toEqual([])
  })

  it('aggregates an unordered case pair once the threshold is met, with example words', async () => {
    initIndexStore([indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 })])
    stubParadigmFetch({ 'kobieta|NOUN': { forms: kobietaSingularForms() } })

    // Expected: locative ("kobiecie"). Answer given: "kobiety" — genitive sg's own form,
    // and genitive sg's ONLY (dative/locative are "kobiecie", not "kobiety") — an
    // unambiguous match, per the task text's own worked example.
    await db.reviewLogs.bulkAdd([
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 1 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'Kobiety', reviewedAt: 2 }), // case-insensitive
      log({ skillId: LOCATIVE_SKILL, answerGiven: '  kobiety  ', reviewedAt: 3 }), // trimmed
    ])

    const matrix = await getConfusionMatrix()
    expect(matrix).toHaveLength(1)
    expect(matrix[0]).toEqual({
      caseA: 'genitive',
      caseB: 'locative',
      count: 3,
      exampleWordIds: [KOBIETA_ID],
    })
  })

  it('does not attribute an ambiguous answer (matches more than one other dimension)', async () => {
    initIndexStore([indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 })])
    stubParadigmFetch({ 'kobieta|NOUN': { forms: kobietaSingularForms() } })

    // Expected: genitive. Answer given: "kobiecie" — matches BOTH dative AND locative sg,
    // so this must not be counted toward either pair.
    await db.reviewLogs.bulkAdd([
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiecie', reviewedAt: 1 }),
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiecie', reviewedAt: 2 }),
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiecie', reviewedAt: 3 }),
    ])

    expect(await getConfusionMatrix()).toEqual([])
  })

  it('ignores correct answers, non-noun dimensions, and words without a paradigm', async () => {
    initIndexStore([
      indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 }),
      indexEntry({ lemma: 'bezparadygmat', pos: 'NOUN', paradigmShard: -1 }),
    ])
    stubParadigmFetch({ 'kobieta|NOUN': { forms: kobietaSingularForms() } })

    const vocabSkill = encodeSkillId(KOBIETA_ID, 'vocab:pl-ru')
    const noParadigmSkill = encodeSkillId(encodeWordId('bezparadygmat', 'NOUN'), 'noun:sg:genitive')

    await db.reviewLogs.bulkAdd([
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', correct: true, reviewedAt: 1 }), // correct — ignored
      log({ skillId: vocabSkill, answerGiven: 'woman', reviewedAt: 2 }), // not a noun dimension
      log({
        skillId: noParadigmSkill,
        wordId: 'bezparadygmat|NOUN',
        answerGiven: 'x',
        reviewedAt: 3,
      }), // no paradigm
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 4 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 5 }),
    ])

    // Only 2 valid genitive/locative logs — below threshold, and none of the other 3 rows
    // contribute anything (would throw or crash if they were processed incorrectly).
    expect(await getConfusionMatrix()).toEqual([])
  })

  it('never attributes a match to the same case as the question itself', async () => {
    initIndexStore([indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 })])
    // Give genitive sg two accepted spellings so a same-case "alternate answer" can occur —
    // this must never register as a confusion pair with itself.
    const forms = [
      ...kobietaSingularForms(),
      encodeForm({ form: 'kobiety-alt', number: 'singular', case: 'genitive' }),
    ]
    stubParadigmFetch({ 'kobieta|NOUN': { forms } })

    await db.reviewLogs.bulkAdd([
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiety-alt', reviewedAt: 1 }),
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiety-alt', reviewedAt: 2 }),
      log({ skillId: GENITIVE_SKILL, answerGiven: 'kobiety-alt', reviewedAt: 3 }),
    ])

    expect(await getConfusionMatrix()).toEqual([])
  })

  it('sorts pairs by count descending', async () => {
    initIndexStore([indexEntry({ lemma: 'kobieta', pos: 'NOUN', paradigmShard: 0 })])
    stubParadigmFetch({ 'kobieta|NOUN': { forms: kobietaSingularForms() } })

    // genitive<->locative: 3 occurrences. genitive<->dative would need a form that matches
    // ONLY dative — use accusative<->genitive via "kobiety" would be ambiguous with real
    // forms, so instead drive a second, smaller pair via accusative expecting "kobietą"
    // (instrumental) answered as "kobietę" (accusative)'s own inverse — expected instrumental,
    // answered "kobietę" (accusative-only form).
    const instrumentalSkill = encodeSkillId(KOBIETA_ID, 'noun:sg:instrumental')
    await db.reviewLogs.bulkAdd([
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 1 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 2 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 3 }),
      log({ skillId: LOCATIVE_SKILL, answerGiven: 'kobiety', reviewedAt: 4 }),
      log({ skillId: instrumentalSkill, answerGiven: 'kobietę', reviewedAt: 5 }),
      log({ skillId: instrumentalSkill, answerGiven: 'kobietę', reviewedAt: 6 }),
      log({ skillId: instrumentalSkill, answerGiven: 'kobietę', reviewedAt: 7 }),
    ])

    const matrix = await getConfusionMatrix()
    expect(matrix).toHaveLength(2)
    expect(matrix[0]).toMatchObject({ caseA: 'genitive', caseB: 'locative', count: 4 })
    expect(matrix[1]).toMatchObject({ caseA: 'accusative', caseB: 'instrumental', count: 3 })
  })
})
