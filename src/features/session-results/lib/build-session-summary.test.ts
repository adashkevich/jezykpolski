/**
 * `build-session-summary.ts` (`spec/tasks/14-session-results.md` §1, acceptance points
 * 1-3). Pure unit tests against hand-built `ReviewLogRecord[]` — no Dexie involved.
 */
import { describe, expect, it } from 'vitest'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'
import { AGAIN, EASY, GOOD, HARD } from '@/learning/srs/policy.ts'
import { buildSessionSummary, mistakeSkillIds } from './build-session-summary.ts'

const CZLOWIEK = encodeWordId('człowiek', 'NOUN')
const KOBIETA = encodeWordId('kobieta', 'NOUN')
const DOBRY = encodeWordId('dobry', 'ADJ')

const CZLOWIEK_LOCATIVE = encodeSkillId(CZLOWIEK, 'noun:sg:locative')
const KOBIETA_DATIVE = encodeSkillId(KOBIETA, 'noun:sg:dative')
const DOBRY_GENITIVE = encodeSkillId(DOBRY, 'adj:sg:masculine_inanimate:genitive')

function log(
  overrides: Partial<ReviewLogRecord> & Pick<ReviewLogRecord, 'skillId' | 'reviewedAt'>,
): ReviewLogRecord {
  const wordId = overrides.skillId.split('::')[0]!
  return {
    id: undefined,
    sessionId: 1,
    wordId,
    exerciseType: 'input',
    rating: GOOD,
    correct: true,
    answerGiven: 'x',
    expected: 'x',
    elapsedMs: 1000,
    srsApplied: true,
    ...overrides,
  }
}

describe('buildSessionSummary — score (acceptance point 1)', () => {
  it('totalCount/correctCount/percent are derived from first-attempt-per-skill logs, not raw log count', () => {
    const logs: ReviewLogRecord[] = [
      log({ skillId: CZLOWIEK_LOCATIVE, reviewedAt: 1000, rating: AGAIN, correct: false }),
      // A requeued retry of the SAME skill, answered correctly the second time — must not
      // turn the session's score into 2/2 or hide the original mistake.
      log({ skillId: CZLOWIEK_LOCATIVE, reviewedAt: 2000, rating: GOOD, correct: true }),
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 1500, rating: GOOD, correct: true }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 2 }, logs)
    expect(summary.totalCount).toBe(2) // 2 distinct skills, not 3 raw logs
    expect(summary.correctCount).toBe(1) // only kobieta's first (and only) attempt
    expect(summary.percent).toBe(50)
  })

  it('percent is 0 for a totalCount of 0 (never divides by zero)', () => {
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 0 }, [])
    expect(summary.totalCount).toBe(0)
    expect(summary.percent).toBe(0)
  })

  it('a near-miss (Hard rating, correct:false) counts as correct for the score, matching SessionRunner.tsx#summarizeSession', () => {
    const logs: ReviewLogRecord[] = [
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 1000, rating: HARD, correct: false }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 1 }, logs)
    expect(summary.correctCount).toBe(1)
    expect(summary.percent).toBe(100)
  })

  it('passes newSkillCount/reviewedSkillCount straight through from the session record, not recomputed', () => {
    const summary = buildSessionSummary({ newSkillCount: 6, reviewedSkillCount: 14 }, [
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 1000 }),
    ])
    expect(summary.newSkillCount).toBe(6)
    expect(summary.reviewedSkillCount).toBe(14)
  })
})

describe('buildSessionSummary — mistakes (acceptance point 2, FR-100)', () => {
  it('formats each first-attempt mistake as answerGiven -> expected with lemma + dimension label', () => {
    const logs: ReviewLogRecord[] = [
      log({
        skillId: CZLOWIEK_LOCATIVE,
        reviewedAt: 1000,
        rating: AGAIN,
        correct: false,
        answerGiven: 'człowieka',
        expected: 'człowieku',
      }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 1 }, logs)
    expect(summary.mistakes).toHaveLength(1)
    expect(summary.mistakes[0]).toMatchObject({
      skillId: CZLOWIEK_LOCATIVE,
      wordId: CZLOWIEK,
      lemma: 'człowiek',
      answerGiven: 'człowieka',
      expected: 'człowieku',
    })
    expect(summary.mistakes[0]!.dimensionLabel).toEqual({ pl: 'Miejscownik', ru: 'Предложный' })
  })

  it('excludes a skill from mistakes once its FIRST attempt was correct, even if a later repeat is wrong', () => {
    const logs: ReviewLogRecord[] = [
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 1000, rating: GOOD, correct: true }),
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 2000, rating: AGAIN, correct: false }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 1 }, logs)
    expect(summary.mistakes).toEqual([])
  })

  it("mistakeSkillIds() extracts exactly the mistakes' skillIds, in order", () => {
    const logs: ReviewLogRecord[] = [
      log({ skillId: CZLOWIEK_LOCATIVE, reviewedAt: 1000, rating: AGAIN, correct: false }),
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 2000, rating: GOOD, correct: true }),
      log({ skillId: DOBRY_GENITIVE, reviewedAt: 3000, rating: AGAIN, correct: false }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 3 }, logs)
    expect(mistakeSkillIds(summary)).toEqual([CZLOWIEK_LOCATIVE, DOBRY_GENITIVE])
  })
})

describe('buildSessionSummary — hardestDimensions (acceptance point 3)', () => {
  it('groups by dimension and sorts ascending by accuracy (worst first)', () => {
    const logs: ReviewLogRecord[] = [
      // locative: 1/3 correct (~33%)
      log({ skillId: CZLOWIEK_LOCATIVE, reviewedAt: 1000, rating: AGAIN, correct: false }),
      log({
        skillId: encodeSkillId(KOBIETA, 'noun:sg:locative'),
        reviewedAt: 1100,
        rating: AGAIN,
        correct: false,
      }),
      log({
        skillId: encodeSkillId(DOBRY, 'adj:sg:masculine_inanimate:locative'),
        reviewedAt: 1200,
        rating: GOOD,
        correct: true,
      }),
      // dative: 2/2 correct (100%)
      log({ skillId: KOBIETA_DATIVE, reviewedAt: 2000, rating: GOOD, correct: true }),
      log({
        skillId: encodeSkillId(CZLOWIEK, 'noun:sg:dative'),
        reviewedAt: 2100,
        rating: EASY,
        correct: true,
      }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 0, reviewedSkillCount: 5 }, logs)

    expect(summary.hardestDimensions.map((d) => d.key)).toEqual(['case:locative', 'case:dative'])
    expect(summary.hardestDimensions[0]).toMatchObject({
      accuracy: 1 / 3,
      correctCount: 1,
      totalCount: 3,
    })
    expect(summary.hardestDimensions[1]).toMatchObject({
      accuracy: 1,
      correctCount: 2,
      totalCount: 2,
    })
  })

  it('a session with only vocab skills still produces per-direction groups, not one collapsed bucket hiding accuracy', () => {
    const logs: ReviewLogRecord[] = [
      log({
        skillId: encodeSkillId(KOBIETA, 'vocab:pl-ru'),
        reviewedAt: 1000,
        rating: AGAIN,
        correct: false,
      }),
      log({
        skillId: encodeSkillId(CZLOWIEK, 'vocab:pl-ru'),
        reviewedAt: 1100,
        rating: GOOD,
        correct: true,
      }),
    ]
    const summary = buildSessionSummary({ newSkillCount: 2, reviewedSkillCount: 0 }, logs)
    expect(summary.hardestDimensions).toHaveLength(1)
    expect(summary.hardestDimensions[0]).toMatchObject({ key: 'vocab:pl-ru', accuracy: 0.5 })
  })
})
