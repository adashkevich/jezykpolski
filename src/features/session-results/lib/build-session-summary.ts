/**
 * Pure summary computation for `/session/result` (`spec/tasks/14-session-results.md` §1,
 * `spec/app-design.md` §21, requirements FR-100/FR-101). Takes exactly what's durably
 * persisted — the finished session's `reviewLogs` (`db/repositories/reviews.repository.ts
 * #getLogsForSession`) plus its `SessionRecord`'s own `newSkillCount`/`reviewedSkillCount`
 * — and derives everything the results screen renders. No React, no Dexie: same "pure
 * domain logic, tested without rendering anything" spirit as `learning/**`, even though this
 * lives under `features/session-results/**` (screen-specific shaping, not a cross-feature
 * domain concept).
 *
 * `newSkillCount`/`reviewedSkillCount` come from the `SessionRecord`, NOT recomputed from
 * `logs` here — `useSessionBootstrap.ts`'s own `summarizeLogsForAbandonedSession` doc comment
 * already explains why: "new vs. already-known" isn't a fact `reviewLogs` alone can answer
 * (a log row doesn't say whether its skill's `SkillRecord` was created moments before it).
 * `totalCount`/`correctCount`/`percent`, by contrast, ARE recomputed from `logs` directly
 * (acceptance point 1: "соответствуют реальным логам сессии") rather than trusted from the
 * `SessionRecord`'s own pre-computed tallies — this file has zero dependency on those two
 * fields being correct upstream.
 *
 * "First attempt per skill" (`firstLogsBySkill`) mirrors `stores/session.store.ts`'s own
 * `firstAnswerBySkill`/`mistakes` semantics exactly, so this offline recomputation (run after
 * the live session state has already been thrown away — architecture.md §10, Zustand never
 * persists it) agrees with what the learner actually saw on screen: a skill missed on
 * attempt 1 but corrected via the mistake-requeue on attempt 2 (`SessionRunner.tsx`'s own
 * requeue mechanic) still counts as ONE mistake here, not zero — the requeued retry doesn't
 * retroactively erase the fact that the first answer was wrong.
 */
import { AGAIN } from '@/learning/srs/policy.ts'
import {
  decodeSkillId,
  decodeWordId,
  type SkillId,
  type WordId,
} from '@/learning/skills/skill-id.ts'
import type { DimensionLabel } from '@/learning/skills/dimensions.ts'
import type { ReviewLogRecord } from '@/types/progress.ts'
import { dimensionGroup } from './dimension-group.ts'

export interface MistakeEntry {
  readonly skillId: SkillId
  readonly wordId: WordId
  /** The word's own dictionary form — `decodeWordId(wordId).lemma`, e.g. "człowiek". */
  readonly lemma: string
  readonly dimensionLabel: DimensionLabel
  /** What the learner actually typed/picked (`ReviewLogRecord.answerGiven`, FR-100). */
  readonly answerGiven: string
  /** The accepted answer that graded this attempt (`ReviewLogRecord.expected`). */
  readonly expected: string
}

export interface HardestDimensionEntry {
  /** Stable grouping key (`dimension-group.ts#DimensionGroup.key`) — not shown, only used
   *  for React list keys / test assertions that need something more specific than the
   *  (possibly duplicated across languages) label text. */
  readonly key: string
  readonly label: DimensionLabel
  /** 0..1 — `correctCount / totalCount` for this dimension group, first attempts only. */
  readonly accuracy: number
  readonly correctCount: number
  readonly totalCount: number
}

export interface SessionSummaryView {
  readonly totalCount: number
  readonly correctCount: number
  /** 0..100, rounded — `0` for a `totalCount` of `0` (never divides by zero). */
  readonly percent: number
  readonly newSkillCount: number
  readonly reviewedSkillCount: number
  /** First-attempt-wrong entries only, in the order they were first answered. */
  readonly mistakes: readonly MistakeEntry[]
  /** Sorted ascending by `accuracy` (worst first, `spec/tasks/14-session-results.md`'s own
   *  "сортировка по возрастанию точности"); ties broken by `key` for a deterministic order. */
  readonly hardestDimensions: readonly HardestDimensionEntry[]
}

/** One row per `skillId` — the earliest-`reviewedAt` log for it, i.e. exactly the answer
 *  `stores/session.store.ts#recordAnswer` would have set `firstAnswerBySkill`/`mistakes`
 *  from while the session was live. */
function firstLogsBySkill(logs: readonly ReviewLogRecord[]): ReviewLogRecord[] {
  const bySkill = new Map<SkillId, ReviewLogRecord>()
  for (const log of [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt)) {
    if (!bySkill.has(log.skillId)) bySkill.set(log.skillId, log)
  }
  return [...bySkill.values()]
}

export function buildSessionSummary(
  session: { readonly newSkillCount: number; readonly reviewedSkillCount: number },
  logs: readonly ReviewLogRecord[],
): SessionSummaryView {
  const firstLogs = firstLogsBySkill(logs)

  const totalCount = firstLogs.length
  // `rating !== AGAIN` — matches `SessionRunner.tsx#summarizeSession`'s own definition of
  // "correct" (a near-miss graded Hard still counts as recalled for the headline score, even
  // though `log.correct` is `false` for it — see `mistakes` below, which uses the stricter
  // boolean and so CAN include a near-miss the score doesn't penalize).
  const correctCount = firstLogs.filter((log) => log.rating !== AGAIN).length
  const percent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0

  const mistakes: MistakeEntry[] = firstLogs
    .filter((log) => !log.correct)
    .map((log) => {
      const { wordId, dimension } = decodeSkillId(log.skillId)
      const { lemma } = decodeWordId(wordId)
      return {
        skillId: log.skillId,
        wordId,
        lemma,
        dimensionLabel: dimensionGroup(dimension).label,
        answerGiven: log.answerGiven,
        expected: log.expected,
      }
    })

  const buckets = new Map<string, { label: DimensionLabel; correct: number; total: number }>()
  for (const log of firstLogs) {
    const { dimension } = decodeSkillId(log.skillId)
    const { key, label } = dimensionGroup(dimension)
    const bucket = buckets.get(key) ?? { label, correct: 0, total: 0 }
    bucket.total += 1
    if (log.correct) bucket.correct += 1
    buckets.set(key, bucket)
  }
  const hardestDimensions: HardestDimensionEntry[] = [...buckets.entries()]
    .map(([key, { label, correct, total }]) => ({
      key,
      label,
      accuracy: correct / total,
      correctCount: correct,
      totalCount: total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || a.key.localeCompare(b.key))

  return {
    totalCount,
    correctCount,
    percent,
    newSkillCount: session.newSkillCount,
    reviewedSkillCount: session.reviewedSkillCount,
    mistakes,
    hardestDimensions,
  }
}

/** The distinct `skillId`s a "Разобрать ошибки" click should start a `mode: 'mistakes'`
 *  session with — exactly `mistakes`' own `skillId`s, in the same order. Exported
 *  separately from `SessionSummaryView.mistakes` so `SessionResultPage` doesn't need to
 *  `.map()` it out itself at every call site. */
export function mistakeSkillIds(summary: SessionSummaryView): SkillId[] {
  return summary.mistakes.map((m) => m.skillId)
}
