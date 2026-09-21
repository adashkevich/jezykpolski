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
 *
 * **Изменено задачей 45** (`spec/tasks/45-accuracy-counts-first-clean-answer.md` §3): «верным»
 * в счёте (`correctCount`/`percent`) и в измерениях (`hardestDimensions`) теперь считается только
 * ЧИСТЫЙ первый ответ — `learning/progress/accuracy.ts#isCleanLog` (у старых логов без поля
 * `clean` — запасное правило `correct && rating !== HARD`), а не `rating !== AGAIN`/`log.correct`.
 * Раньше набор с исправленной буквой или подсказкой (рейтинг Hard, `correct: true`) шёл в
 * «верно», а near-miss таблицы (`correct: false`, Hard) — тоже. `mistakes` остаётся по
 * `!log.correct`; чтобы у упавшего процента было объяснение, верные-но-нечистые первые ответы
 * перечислены отдельно (`assisted`) с пометкой «с исправлением» / «с подсказкой».
 */
import { firstLogsBySkill, isCleanLog } from '@/learning/progress/accuracy.ts'
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
  /** Был ли ответ набран, а не выбран из списка (`ReviewLogRecord.exerciseType`). Только для
   *  таких строк побуквенное сравнение (task 28, FR-58) что-то значит: у `choice`-ответа
   *  «кот» против «собака» посимвольный дифф — шум, а не подсказка. */
  readonly typedAnswer: boolean
}

/** Задача 45 §3: первый ответ, который засчитан как верный (`correct`), но НЕ чистый — набор с
 *  исправленной ошибкой или подсказкой, самооценка «Трудно». Именно эти ответы (вместе с
 *  `mistakes`) снижают процент, и без строки в списке падение ничем не объяснено. */
export interface AssistedEntry {
  readonly skillId: SkillId
  readonly wordId: WordId
  readonly lemma: string
  readonly dimensionLabel: DimensionLabel
  /** Принятый ответ, к которому пришёл пользователь (`ReviewLogRecord.expected`). */
  readonly expected: string
  /** Чем ответ не безупречен: `hinted` — «с подсказкой», `corrected` — «с исправлением»; `null` —
   *  у лога нет `assist` (записан до задачи 45, либо самооценка «Трудно»), причина неизвестна. */
  readonly assist: 'hinted' | 'corrected' | null
}

export interface HardestDimensionEntry {
  /** Stable grouping key (`dimension-group.ts#DimensionGroup.key`) — not shown, only used
   *  for React list keys / test assertions that need something more specific than the
   *  (possibly duplicated across languages) label text. */
  readonly key: string
  readonly label: DimensionLabel
  /** 0..1 — `correctCount / totalCount` for this dimension group, first attempts only, and only
   *  clean ones count as correct (task 45). */
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
  /** Верные, но нечистые первые ответы (задача 45 §3), в порядке первого ответа. Не входят ни в
   *  `mistakes`, ни в «Разобрать ошибки» (`mistakeSkillIds`) — это не ошибки, а помощь. */
  readonly assisted: readonly AssistedEntry[]
  /** Sorted ascending by `accuracy` (worst first, `spec/tasks/14-session-results.md`'s own
   *  "сортировка по возрастанию точности"); ties broken by `key` for a deterministic order. */
  readonly hardestDimensions: readonly HardestDimensionEntry[]
}

export function buildSessionSummary(
  session: { readonly newSkillCount: number; readonly reviewedSkillCount: number },
  logs: readonly ReviewLogRecord[],
): SessionSummaryView {
  const firstLogs = firstLogsBySkill(logs)

  const totalCount = firstLogs.length
  // Задача 45: «верно» — только чистый первый ответ (`isCleanLog`); тем же определением считает
  // `SessionRecord.correctCount` (`accuracy.ts#summarizeFirstAnswers`) и «Точность» на главной.
  const correctCount = firstLogs.filter(isCleanLog).length
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
        typedAnswer: log.exerciseType === 'input' || log.exerciseType === 'form-input',
      }
    })

  const assisted: AssistedEntry[] = firstLogs
    .filter((log) => log.correct && !isCleanLog(log))
    .map((log) => {
      const { wordId, dimension } = decodeSkillId(log.skillId)
      const { lemma } = decodeWordId(wordId)
      return {
        skillId: log.skillId,
        wordId,
        lemma,
        dimensionLabel: dimensionGroup(dimension).label,
        expected: log.expected,
        assist: log.assist ?? null,
      }
    })

  const buckets = new Map<string, { label: DimensionLabel; correct: number; total: number }>()
  for (const log of firstLogs) {
    const { dimension } = decodeSkillId(log.skillId)
    const { key, label } = dimensionGroup(dimension)
    const bucket = buckets.get(key) ?? { label, correct: 0, total: 0 }
    bucket.total += 1
    if (isCleanLog(log)) bucket.correct += 1
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
    assisted,
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
