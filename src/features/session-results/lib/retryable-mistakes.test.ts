/**
 * `retryable-mistakes.ts` (финальное ревью 41–45, I2): «Разобрать ошибки» не предлагает ввод,
 * заблокированный «Показать слово» (`SkillRecord.awaitingRecognition`, задача 43) — сессия
 * `collapseVocabStages`-ом его отбросит. Настоящая (fake-indexeddb) база, как у
 * `SessionResultPage.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, openDatabase } from '@/db/repositories/lifecycle.repository.ts'
import { upsertSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, encodeWordId } from '@/learning/skills/skill-id.ts'
import type { ReviewLogRecord, SkillRecord } from '@/types/progress.ts'
import { buildSessionSummary } from './build-session-summary.ts'
import { retryableMistakeSkillIds } from './retryable-mistakes.ts'

const KOBIETA = encodeWordId('kobieta', 'NOUN')
const KOT = encodeWordId('kot', 'NOUN')
const KOBIETA_INPUT = encodeSkillId(KOBIETA, 'vocab:ru-pl-input')
const KOT_INPUT = encodeSkillId(KOT, 'vocab:ru-pl-input')
const KOT_CHOICE = encodeSkillId(KOT, 'vocab:ru-pl-choice')
const GHOST_INPUT = encodeSkillId(encodeWordId('pies', 'NOUN'), 'vocab:ru-pl-input')

function vocabSkill(skillId: string, overrides: Partial<SkillRecord> = {}): SkillRecord {
  const [wordId, dimension] = skillId.split('::') as [string, SkillRecord['dimension']]
  return {
    skillId,
    wordId,
    kind: 'vocab',
    dimension,
    state: 'review',
    stability: 40,
    difficulty: 5,
    due: 1500,
    reps: 3,
    lapses: 0,
    correct: 3,
    incorrect: 0,
    createdAt: 500,
    updatedAt: 1500,
    ...overrides,
  }
}

function wrongLog(skillId: string, reviewedAt: number): ReviewLogRecord {
  return {
    sessionId: 1,
    skillId,
    wordId: skillId.split('::')[0]!,
    exerciseType: 'input',
    reviewedAt,
    rating: 1,
    correct: false,
    answerGiven: '',
    expected: 'x',
    elapsedMs: 500,
    srsApplied: true,
  }
}

const SESSION = { newSkillCount: 0, reviewedSkillCount: 3 }

beforeEach(async () => {
  await openDatabase()
})

afterEach(async () => {
  await deleteDatabase()
})

describe('retryableMistakeSkillIds', () => {
  it('отбрасывает ввод с awaitingRecognition, остальные ошибки оставляет в порядке ответов', async () => {
    await upsertSkill(vocabSkill(KOBIETA_INPUT, { awaitingRecognition: true, correctStreak: 0 }))
    await upsertSkill(vocabSkill(KOT_INPUT))
    await upsertSkill(vocabSkill(KOT_CHOICE))
    const summary = buildSessionSummary(SESSION, [
      wrongLog(KOBIETA_INPUT, 1),
      wrongLog(KOT_INPUT, 2),
      wrongLog(KOT_CHOICE, 3),
    ])

    expect(await retryableMistakeSkillIds(summary)).toEqual([KOT_INPUT, KOT_CHOICE])
  })

  it('единственная ошибка — заблокированный ввод: список пуст (кнопка не нужна)', async () => {
    await upsertSkill(vocabSkill(KOBIETA_INPUT, { awaitingRecognition: true }))
    const summary = buildSessionSummary(SESSION, [wrongLog(KOBIETA_INPUT, 1)])

    expect(summary.mistakes).toHaveLength(1) // в списке «Ошибки» слово остаётся
    expect(await retryableMistakeSkillIds(summary)).toEqual([])
  })

  it('навык, которого в БД нет, остаётся — его отбросит сам resolveMistakeScope', async () => {
    const summary = buildSessionSummary(SESSION, [wrongLog(GHOST_INPUT, 1)])

    expect(await retryableMistakeSkillIds(summary)).toEqual([GHOST_INPUT])
  })

  it('без ошибок — пустой список', async () => {
    expect(await retryableMistakeSkillIds(buildSessionSummary(SESSION, []))).toEqual([])
  })
})
