/**
 * Grades exactly one CORRECT `matching` pairing (task 27 §4, widened by task 39 to both
 * directions, extracted from `useMatchingPracticeSession.ts#gradePair` by task 40 §4 so the
 * daily session's own matching block — `useSessionBootstrap.ts` — can reuse the exact same
 * grading behavior instead of reimplementing it).
 *
 * Grades BOTH `vocab:pl-ru` (PL→RU, prompt = the Polish tile) and `vocab:ru-pl-choice`
 * (RU→PL, prompt = the Russian tile) — the grid is equally observable in both directions
 * (task 39's decision). `vocab:ru-pl-choice` is materialized immediately (`ensureSkill`) even
 * for a brand-new word whose stage 2 the daily session's own streak gate
 * (`learning/progress/stage.ts`) hasn't opened yet — matching is a second, explicit path into
 * stage 2, not gated by that threshold. `vocab:pl-ru` MUST be graded first, and the two
 * `submitAnswer` calls MUST run sequentially, not via `Promise.all`: the first call can itself
 * materialize the second skill (`answer-pipeline.ts#unlockNextVocabStage`), so two concurrent
 * writers racing `ensureSkill`/`submitAnswer` on that same skill would corrupt it.
 * `vocab:ru-pl-input` (stage 3, typing) is untouched — the grid never asks for a typed answer.
 *
 * `skipCascade: true` on both calls (task 40 §2's cascade, `answer-pipeline.ts`'s own doc
 * comment on `SubmitAnswerInput.skipCascade`): this function already credits both directions
 * explicitly, on purpose — the cascade would otherwise re-credit `vocab:pl-ru` a second time
 * once the `vocab:ru-pl-choice` call runs, double-counting one match into two `correct`
 * increments on the lower stage.
 */
import type { Exercise, MatchingPairSource } from '@/learning/exercises/exercise.types.ts'
import { ensureSkill } from '@/db/repositories/skills.repository.ts'
import { encodeSkillId, type SkillId } from '@/learning/skills/skill-id.ts'
import type { Rating, SessionMode } from '@/types/progress.ts'
import { submitAnswer } from './answer-pipeline.ts'

export interface GradeMatchingPairInput {
  readonly sessionId: number
  /** `'practice'` for both callers today (the standalone `/practice/matching` screen and the
   *  daily session's matching block alike) — a tap-to-match grid is an easy, low-friction
   *  action compared to actively recalling/typing, so it earns the same capped/damped SRS
   *  credit `policy.ts` Rule 2 already gives every other Practice-mode answer, even when
   *  embedded inside an otherwise `mode: 'learn'` session (mirrors
   *  `useSessionBootstrap.ts`'s `{ kind: 'practice-extra' }` scope, which forces `'practice'`
   *  the same way regardless of the caller's own session mode). */
  readonly mode: SessionMode
  readonly pair: MatchingPairSource
  readonly elapsedMs: number
  readonly now: number
}

/** Per-direction outcome — `useSessionBootstrap.ts`'s in-session matching block (task 40 §4)
 *  needs these to `seedFirstAnswers` the session store the same way a plain answered
 *  question would, so the two credited skills count toward the session summary and toward
 *  the mistake-requeue's damping guard exactly like any other skill. */
export interface GradedMatchingSkill {
  readonly skillId: SkillId
  readonly rating: Rating
  readonly isNewSkill: boolean
}

export interface GradeMatchingPairResult {
  /** Always 2 (one per direction) — named, not hard-coded at call sites, so a future
   *  direction count change has exactly one place to update. */
  readonly total: number
  /** Always equal to `total` — only a CORRECT pairing ever reaches this function (see this
   *  module's header on why a wrong pairing is UI-only feedback, never graded at all). */
  readonly correct: number
  readonly newSkillCount: number
  /** One entry per direction, in the order graded (`vocab:pl-ru`, then `vocab:ru-pl-choice`). */
  readonly skills: readonly GradedMatchingSkill[]
}

export async function gradeMatchingPair(input: GradeMatchingPairInput): Promise<GradeMatchingPairResult> {
  const { sessionId, mode, pair, elapsedMs, now } = input
  const skills: GradedMatchingSkill[] = []

  // `vocab:pl-ru` first and awaited before `vocab:ru-pl-choice` starts — see this file's
  // header on why the two must never race.
  for (const [dimension, direction, prompt, correctAnswer] of [
    ['vocab:pl-ru', 'pl-ru', pair.pl, pair.ru],
    ['vocab:ru-pl-choice', 'ru-pl', pair.ru, pair.pl],
  ] as const) {
    const skillId = encodeSkillId(pair.wordId, dimension)
    const skill = await ensureSkill(skillId, pair.wordId, 'vocab', dimension)

    const exercise: Exercise = {
      type: 'choice',
      direction,
      prompt,
      options: [correctAnswer],
      correct: correctAnswer,
    }

    const result = await submitAnswer({
      sessionId,
      mode,
      exercise,
      skillId,
      wordId: pair.wordId,
      kind: 'vocab',
      answerGiven: correctAnswer,
      isFirstAnswerInSession: skill.reps === 0,
      elapsedMs,
      now,
      skipCascade: true,
    })

    skills.push({ skillId, rating: result.rating, isNewSkill: result.isNewSkill })
  }

  const newSkillCount = skills.filter((s) => s.isNewSkill).length
  return { total: skills.length, correct: skills.length, newSkillCount, skills }
}
