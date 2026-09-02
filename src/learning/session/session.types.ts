/**
 * Session-queue domain types (`spec/tasks/13-session-runner.md` §1, `spec/architecture.md`
 * §10). Split out from `build-learn-queue.ts` itself so a future `build-practice-queue.ts`
 * (task 19, explicitly out of this task's scope) can produce/consume the same `QueuePlan`
 * shape without importing `build-learn-queue.ts`'s own module (which would otherwise be the
 * only place `QueuePlanItem` was declared).
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3) — same rule
 * as every other `src/learning/**` file.
 */
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type { Rating, SkillKind, SkillRecord, WordStatus } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { LevelValue } from '@/content/codec.ts'

/**
 * One slot in a built queue, before any exercise has been generated for it. Two shapes:
 *
 *  - `'due'` — an already-materialized skill whose `due` has passed (or which is mid
 *    learning/relearning) — the caller already has its `SkillRecord`, no `ensureSkill` call
 *    needed before generating its exercise.
 *  - `'new'` — a word the learner hasn't started yet. Carries the `WordIndexEntry`, not a
 *    `SkillRecord` (none exists) — task text rule 4: only `vocab:pl-ru` gets materialized
 *    for it, and only once this item is actually about to be turned into an exercise (lazy,
 *    same spirit as architecture.md §5.2's lazy materialization — a word merely *offered* as
 *    a queue candidate must not gain a `SkillRecord` before the learner actually reaches it,
 *    e.g. if the session is abandoned before this item is ever shown).
 */
export type LearnQueueItem =
  | { readonly source: 'due'; readonly skill: SkillRecord }
  | { readonly source: 'new'; readonly word: WordIndexEntry; readonly wordId: WordId }

export interface QueuePlan {
  readonly items: readonly LearnQueueItem[]
}

/**
 * One graded attempt, as `stores/session.store.ts`'s `SessionState.answers` (architecture.md
 * §10) stores it, keyed by `ExerciseInstance.id` (not `skillId` — the damping/mistake-requeue
 * flow can show the same skill via two different `ExerciseInstance`s in one session, and each
 * needs its own recorded attempt).
 */
export interface AnswerAttempt {
  readonly skillId: SkillId
  readonly answerGiven: string
  readonly correct: boolean
  readonly rating: Rating
  readonly elapsedMs: number
}

// ---------------------------------------------------------------------------
// Practice (task 19, `spec/tasks/19-practice-mode.md`, `spec/app-design.md` §23/§24,
// FR-111...FR-114) — the manual counterpart to `buildLearnQueue` above. Deliberately a
// separate item/plan shape rather than reusing `LearnQueueItem`/`QueuePlan`: a Learn item is
// either an already-`due` `SkillRecord` or a brand-new word's `vocab:pl-ru` slot (the two
// `source` branches), because the *scheduler* decided what to show. A Practice item carries
// no such distinction — the user explicitly picked a section + set of dimensions, and every
// matching skill (whether it already has a `SkillRecord` or not, whether it's anywhere near
// `due`) is an equally valid queue member. `build-practice-queue.ts` reflects that: it takes
// a `PracticeConfig` + already-enumerated candidate words and just matches/samples, with no
// `due`-vs-`new` split to preserve.
// ---------------------------------------------------------------------------

/** The three sections `features/training-setup/**`'s one parameterized component can
 *  configure (`spec/tasks/19-practice-mode.md` step 1: "существительные, глаголы,
 *  прилагательные... один компонент, три конфигурации"). ADV is deliberately excluded —
 *  its only skills are the two `adv:degree:*` comparison forms (`enumerate.ts`), not enough
 *  surface for a standalone Practice section in this MVP; nothing in FR-111..FR-114 asks for
 *  one either. */
export type PracticeSection = 'NOUN' | 'VERB' | 'ADJ'

/**
 * The full state of the "Настройка тренировки" screen (`spec/app-design.md` §23's mockup,
 * FR-114's parameter list: "уровень, статус, частотность, что тренировать... тип задания...
 * количество заданий"). Plain data — JSON-serializable as-is, so it can be written straight
 * to `settings` (task text step 4, "последняя конфигурация сохраняется") without a separate
 * encode/decode step.
 *
 * `dimensionSelection` is keyed by the *axis* names `features/training-setup/config
 * /training-sections.ts`'s `TrainingDimensionGroup.key` declares for the current `section`
 * (`'case'`/`'number'` for NOUN; `'tense'`/`'person'`/`'number'` for VERB;
 * `'case'`/`'gender'`/`'number'`/`'degree'` for ADJ) — each value is the list of raw
 * `Dimension`-segment strings the user checked for that axis (e.g. `case: ['nominative',
 * 'genitive']`, `person: ['1', '2']` — person as decimal strings, matching what
 * `dimension.split(':')` itself yields, not the numeric `PersonValue`). Deliberately
 * `Record<string, string[]>` rather than a per-section discriminated shape: it keeps this
 * type (and therefore the settings blob) usable unchanged for whichever section is active,
 * exactly the "один компонент, декларативная конфигурация" the task text asks for — the
 * *matching* logic in `build-practice-queue.ts` is what actually knows which axis keys a
 * given `section` uses.
 */
export interface PracticeConfig {
  readonly section: PracticeSection
  /** "Уровень: До X" (FR-114) — `null` means no level restriction at all. Single "up to"
   *  selector (unlike `/words`' fuller level-filter panel) to match `app-design.md` §23's
   *  one-row mockup; see this task's decision log for why the richer multi-select /
   *  either-mode panel wasn't duplicated here. */
  readonly upToLevel: LevelValue | null
  /** "Статус: Новые + изучаемые" (FR-114) — multi-select, unlike `/words`' single-select
   *  status filter; empty array means no status restriction. */
  readonly status: readonly WordStatus[]
  /** "Частотность: Top N" (FR-114). Reuses `WordQuery.topN`'s own option set rather than
   *  inventing a second one — same options `/words`' own frequency filter already offers. */
  readonly topN: 500 | 1000 | 2000 | 5000 | null
  /** "Что тренировать -> ☑ Перевод" (FR-114) — both `vocab:pl-ru` and `vocab:ru-pl` when on. */
  readonly includeTranslation: boolean
  readonly dimensionSelection: Readonly<Record<string, readonly string[]>>
  /** "Тип задания" (FR-114) — at least one must be `true` for the config to be valid
   *  (`features/training-setup/**` disables "Начать" otherwise, task text step 3's "пустой
   *  результат... до нажатия «Начать»" sibling rule). Both `true` defers to the normal
   *  SRS-state-driven picker (`learning/exercises/picker.ts`), same as Learn; exactly one
   *  `true` forces every exercise in the session to that recognition/recall category
   *  regardless of the skill's own state. */
  readonly exerciseTypes: { readonly choice: boolean; readonly input: boolean }
  /** "N заданий" (FR-114) — the queue's `targetSize`; the actual queue may be smaller if
   *  fewer skills match the filter (never padded, never an error by itself — see
   *  `build-practice-queue.ts`'s own doc comment on the *empty* case, which is the only one
   *  that blocks "Начать"). */
  readonly targetSize: number
}

/** One matched-and-sampled Practice queue slot — always resolved via `ensureSkill` at
 *  materialization time (task text step 2: "новые навыки материализуются по мере показа, та
 *  же ensureSkill"), never pre-fetched as a `SkillRecord` here; `kind`/`dimension` are
 *  carried alongside `skillId`/`wordId` so the materializing caller
 *  (`features/session-runner/lib/build-session-exercises.ts`) never has to re-decode
 *  `skillId` to get them, mirroring `session-scope.ts#resolveSkillScope`'s own reasoning. */
export interface PracticeQueueItem {
  readonly skillId: SkillId
  readonly wordId: WordId
  readonly kind: SkillKind
  readonly dimension: Dimension
}

/** One candidate word already resolved to its section-matching `WordQuery` filter
 *  (level/status/frequency/POS) with its full `enumerateSkills(word, paradigm)` output
 *  attached — the async, content-layer half of building a Practice queue
 *  (`features/session-runner/lib/session-scope.ts#resolvePracticeCandidateWords`), kept
 *  entirely separate from `build-practice-queue.ts`'s own pure matching/sampling so a
 *  dimension-checkbox toggle never has to refetch a single paradigm shard — only a changed
 *  level/status/frequency/section filter does. */
export interface PracticeCandidateWord {
  readonly wordId: WordId
  readonly descriptors: readonly SkillDescriptor[]
}

export interface PracticeQueuePlan {
  readonly items: readonly PracticeQueueItem[]
  /** Distinct words with at least one matching skill — the "N слов" half of `app-design.md`
   *  §23's "Найдено 412 слов, 2 890 форм" preview (task text step 3). Computed by the exact
   *  same matching pass that produces `items`, never a separate approximate count (task
   *  text's explicit rule, acceptance point 5). */
  readonly totalMatchingWordCount: number
  /** Every matching skill across every candidate word — the "N форм" half of the same
   *  preview. Always `>= items.length` (items is this same set, sampled down to
   *  `config.targetSize`). */
  readonly totalMatchingSkillCount: number
}
