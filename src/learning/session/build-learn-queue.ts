/**
 * `buildLearnQueue` (`spec/tasks/13-session-runner.md` §1, `spec/architecture.md` §7/§10,
 * requirements FR-80/FR-81/FR-82/FR-110/FR-133, `spec/tasks/40-vocab-streak-progression.md` §2).
 *
 * Pure function: `SkillRecord[]` + `WordIndexEntry[]` (already fetched by the caller — this
 * module never touches `db/**` or `content/**`) -> an ordered `QueuePlan`. No `ensureSkill`
 * call happens here (task text rule 4's "lazy" half — see `session.types.ts`'s doc comment
 * on `LearnQueueItem`): this only decides *which* skills/words belong in the queue and in
 * what order, not how they get turned into exercises.
 *
 * Priority (task text, verbatim):
 *   1. overdue reviews (`due < now`), oldest `due` first;
 *   2. `learning`/`relearning` skills;
 *   3. new words, up to `newWordsBudget`, in the order the caller already put them in.
 * "Overdue reviews earlier than new words" is satisfied structurally: every `'due'` item is
 * placed before interleaving even starts touching `'new'` items (see `interleaveNewWords`
 * below) — the first item of a non-empty due list is always the queue's first item.
 *
 * Task 40 §2 ("один вопрос на слово за сессию") adds `collapseVocabStages` before any of the
 * above: a word can have 2-3 of its vocab stages due at once (each lives on its own FSRS
 * schedule), and asking about the same word's translation more than once a session is exactly
 * what that task removes — only the earliest-due vocab stage of each word survives into this
 * build, the rest stay due for a later one.
 *
 * Task 35 (`spec/tasks/35-level-gated-new-words.md` §2): this function used to sort
 * `candidateNewWords` by ascending `rank` itself. That sort is gone — `resolveGlobalScope`
 * (`features/session-runner/lib/session-scope.ts`) now decides which levels are even
 * eligible and interleaves them (`learning/session/level-gate.ts#orderNewWordCandidates`,
 * 2:1 by level before rank), and a second unconditional rank-sort here would immediately
 * undo that interleave. See `BuildLearnQueueInput.candidateNewWords` below.
 *
 * "New words are mixed throughout the queue, not appended as a trailing block" (task text's
 * explicit UX rationale: 20 reviews then 5 new words in a row is fatiguing and worse for
 * retention) is `interleaveNewWords`: it spaces new-word items evenly across the due-item
 * list rather than concatenating the two lists.
 *
 * `pure` + deterministic: no `Math.random()`, no wall-clock read beside the `now` parameter
 * the caller already had to supply — the interleave spacing is arithmetic on list lengths,
 * not a shuffle, so the same inputs always produce the same `QueuePlan` (useful for tests,
 * and for "the queue doesn't visibly reshuffle on an unrelated re-render" callers might
 * otherwise worry about).
 */
import type { SkillRecord } from '@/types/progress.ts'
import type { WordIndexEntry } from '@/types/content.ts'
import { encodeWordId } from '@/learning/skills/skill-id.ts'
import type { VocabDimension } from '@/learning/skills/dimensions.ts'
import { isAwaitingRecognition, vocabStageRank } from '@/learning/progress/stage.ts'
import type { LearnQueueItem, QueuePlan } from './session.types.ts'

export interface BuildLearnQueueInput {
  readonly now: number
  readonly dueSkills: readonly SkillRecord[]
  /** FR-133 "daily goal" setting — how many brand-new words this session may introduce. */
  readonly newWordsBudget: number
  /** Words the caller has already filtered to "not started yet" (status `'new'`) and to
   *  whatever scope applies (global / a `WordQuery` filter / a single word) — this function
   *  never decides *which* words are eligible.
   *
   *  Already ordered by the caller (task 35): this function only *trims* the list to
   *  whatever budget/space is left, it does not re-sort it. The global scope orders by
   *  `learning/session/level-gate.ts#orderNewWordCandidates` (level gate + 2:1 mix, rank
   *  ascending within a level); other scopes (a single word, a `WordQuery` filter) pass
   *  their candidates pre-sorted by rank themselves where that still makes sense. */
  readonly candidateNewWords: readonly WordIndexEntry[]
  /** Total queue size — reviews are prioritized into this budget first; new words only fill
   *  whatever room is left after that (task text: overdue reviews crowd out new words when
   *  there's a backlog, never the other way around). */
  readonly targetSize: number
}

function isLearningOrRelearning(skill: SkillRecord): boolean {
  return skill.state === 'learning' || skill.state === 'relearning'
}

/**
 * Task 40 §2 ("один вопрос на слово за сессию", `spec/tasks/40-vocab-streak-progression.md`):
 * when a word has more than one DUE vocab skill at once (its stages live on independent FSRS
 * schedules, so this happens routinely once a word has 2-3 open stages), keep only one —
 * every other vocab dimension of that word is dropped from THIS build, never lost: it stays
 * due and is picked up again once it becomes the earliest-due one (`answer-pipeline.ts`'s
 * cascade — §2.2/§2.3 of the task — is what keeps the lower stages' `due` moving in step with
 * the one actually answered, so they don't all pile up "overdue" forever).
 *
 * Task 43 §2: a `vocab:ru-pl-input` with `awaitingRecognition` ("Показать слово" was pressed on
 * it, `answer-pipeline.ts#submitAnswer`) is dropped BEFORE grouping, even if it is the most
 * overdue stage — the word then arrives as a recognition question (at equal `due` the more
 * advanced of the rest, i.e. `vocab:ru-pl-choice`), and if no other stage of it is due the word
 * simply isn't in this build. The lock is lifted by a streak of correct `vocab:ru-pl-choice`
 * answers or by "Знаю" (`stage.ts#RELEARN_RECOGNITION_STREAK`). Practice needs no such filter:
 * `build-practice-queue.ts` selects by the user's explicit dimension choice, never by `due`.
 *
 * Non-vocab (morphological) skills are untouched, even for a word that also has a vocab
 * skill due — collapsing is specifically about the three translation stages competing to ask
 * "do you know this word's translation" more than once a session, not about a word's forms.
 *
 * Tie-break: earliest `due` wins; if two stages share the exact same `due`, the more advanced
 * stage wins (`vocabStageRank`) — an arbitrary but deterministic choice for an edge case real
 * schedules rarely produce (`due` is `Date.now()`-derived).
 */
export function collapseVocabStages(dueSkills: readonly SkillRecord[]): SkillRecord[] {
  const vocabByWord = new Map<string, SkillRecord[]>()
  const result: SkillRecord[] = []

  for (const skill of dueSkills) {
    if (skill.kind !== 'vocab') {
      result.push(skill)
      continue
    }
    if (isAwaitingRecognition(skill)) continue
    const bucket = vocabByWord.get(skill.wordId)
    if (bucket) bucket.push(skill)
    else vocabByWord.set(skill.wordId, [skill])
  }

  for (const bucket of vocabByWord.values()) {
    result.push(
      bucket.reduce((best, candidate) => {
        if (candidate.due !== best.due) return candidate.due < best.due ? candidate : best
        const bestRank = vocabStageRank(best.dimension as VocabDimension)
        const candidateRank = vocabStageRank(candidate.dimension as VocabDimension)
        return candidateRank > bestRank ? candidate : best
      }),
    )
  }

  return result
}

/** Tier 1 (overdue `review`/`new`-state skills, oldest `due` first) followed by tier 2
 *  (`learning`/`relearning`, also oldest `due` first) — task text's priority steps 1-2. */
function orderDueSkills(dueSkills: readonly SkillRecord[]): SkillRecord[] {
  const tier1: SkillRecord[] = []
  const tier2: SkillRecord[] = []
  for (const skill of dueSkills) {
    ;(isLearningOrRelearning(skill) ? tier2 : tier1).push(skill)
  }
  const byDueAscending = (a: SkillRecord, b: SkillRecord) => a.due - b.due
  tier1.sort(byDueAscending)
  tier2.sort(byDueAscending)
  return [...tier1, ...tier2]
}

/**
 * Spaces `newItems` evenly across the *internal gaps* of `reviewItems` (between two
 * consecutive reviews) rather than concatenating the two lists or inserting at either end —
 * deliberately never before `reviewItems[0]` or after its last element, so a non-empty
 * review list always keeps its first and last items, both anchoring "overdue reviews ahead
 * of new words" (task text priority order) without a separate special case for the edges.
 *
 * With `R` reviews there are `R-1` internal gaps (after review 1, after review 2, ...,
 * after review `R-1`); each of `newItems` is assigned to the gap closest to its even
 * fractional position among them (e.g. 5 new words across 15 reviews' 14 gaps land after
 * reviews 3, 5, 8, 10, 13). When `newItems` outnumbers the available gaps (only possible
 * with very few reviews), multiple new items simply share a gap — there is nowhere better
 * to put them.
 */
function interleaveNewWords(
  reviewItems: readonly LearnQueueItem[],
  newItems: readonly LearnQueueItem[],
): LearnQueueItem[] {
  if (newItems.length === 0) return [...reviewItems]
  if (reviewItems.length === 0) return [...newItems]
  if (reviewItems.length === 1) return [reviewItems[0]!, ...newItems]

  const gapCount = reviewItems.length - 1
  const byGap = new Map<number, LearnQueueItem[]>()
  for (let n = 0; n < newItems.length; n++) {
    const fraction = (n + 1) / (newItems.length + 1) // strictly inside (0, 1)
    const gap = Math.max(1, Math.min(gapCount, Math.round(fraction * reviewItems.length)))
    const bucket = byGap.get(gap)
    if (bucket) bucket.push(newItems[n]!)
    else byGap.set(gap, [newItems[n]!])
  }

  const result: LearnQueueItem[] = []
  for (let i = 0; i < reviewItems.length; i++) {
    result.push(reviewItems[i]!)
    const afterCount = i + 1
    const bucket = afterCount < reviewItems.length ? byGap.get(afterCount) : undefined
    if (bucket) result.push(...bucket)
  }
  return result
}

export function buildLearnQueue(input: BuildLearnQueueInput): QueuePlan {
  const targetSize = Math.max(0, input.targetSize)
  const newWordsBudget = Math.max(0, input.newWordsBudget)

  const orderedDue = orderDueSkills(collapseVocabStages(input.dueSkills))
  const reviewItems: LearnQueueItem[] = orderedDue
    .slice(0, targetSize)
    .map((skill) => ({ source: 'due', skill }))

  const remainingForNew = Math.max(0, targetSize - reviewItems.length)
  const newCount = Math.min(newWordsBudget, remainingForNew, input.candidateNewWords.length)

  const newItems: LearnQueueItem[] = input.candidateNewWords.slice(0, newCount).map((word) => ({
    source: 'new',
    word,
    wordId: encodeWordId(word.lemma, word.pos),
  }))

  const items = interleaveNewWords(reviewItems, newItems).slice(0, targetSize)
  return { items }
}
