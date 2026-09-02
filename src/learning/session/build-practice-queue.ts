/**
 * `buildPracticeQueue` (`spec/tasks/19-practice-mode.md` §2, `spec/architecture.md` §3,
 * requirements FR-111/FR-113/FR-114).
 *
 * Pure function: a `PracticeConfig` + an already-resolved candidate-word list (`ctx`) -> a
 * `PracticeQueuePlan`. Like `build-learn-queue.ts`, this module never touches `db/**` or
 * `content/**` — the async half (matching the config's level/status/frequency/section
 * filter against the word index, fetching each candidate word's paradigm, running
 * `enumerateSkills`) is `features/session-runner/lib/session-scope.ts
 * #resolvePracticeCandidateWords`'s job. What's left here is entirely synchronous:
 *
 *  1. For every candidate word's `SkillDescriptor`s, decide whether it matches the config's
 *     explicit dimension selection (task text: "фильтрация по явно выбранным измерениям, а
 *     не по due" — no `SkillRecord`/`due` involved anywhere in this file).
 *  2. Count the full matching set (`totalMatchingWordCount`/`totalMatchingSkillCount`) — the
 *     "Найдено 412 слов, 2 890 форм" preview (`spec/app-design.md` §23) reads these two
 *     numbers straight off this function's own return value, not a separately-approximated
 *     estimate (task text's explicit rule, acceptance point 5: the preview must be computed
 *     by "той же функцией/логикой, что строит очередь").
 *  3. Deterministically sample `config.targetSize` of the matching set into `items` — the
 *     actual queue. "Новые навыки материализуются по мере показа" (task text) means `items`
 *     is deliberately just `{skillId, wordId, kind, dimension}`, never a `SkillRecord`: the
 *     materializing caller always runs every item through `ensureSkill`, the same lazy
 *     pattern `session-scope.ts#resolveSkillScope` already established for task 17's
 *     single-cell scope — there is no `'due'`/`'new'` split to make here at all, unlike
 *     `LearnQueueItem`.
 *
 * Determinism by `seed` (same discipline as `learning/exercises/distractors.ts`'s own
 * mulberry32 PRNG, duplicated here rather than imported — that module is private to
 * `learning/exercises/**` and this file has no other reason to depend on it): the same
 * `(config, candidateWords, seed)` always produces the same `items`, so a session's queue
 * never silently reshuffles on an unrelated re-render.
 *
 * Pure domain module: no React, no Dexie, no `features/**` (architecture.md §3).
 */
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { Dimension } from '@/learning/skills/dimensions.ts'
import type { WordId } from '@/learning/skills/skill-id.ts'
import type {
  PracticeCandidateWord,
  PracticeConfig,
  PracticeQueueItem,
  PracticeQueuePlan,
} from './session.types.ts'

// ---------------------------------------------------------------------------
// Per-section dimension matching — the counterpart to `learning/skills/enumerate.ts`'s
// `dimensionsForForm` (which builds a `Dimension` string from a decoded form) and
// `content/paradigms.ts`'s `matchesDimension` (which matches a decoded form against one
// `Dimension`). This matches a *dimension string that already exists as a `SkillDescriptor`*
// against the user's per-axis checkbox selection — a third, independent parse of the same
// `"kind:...`" wire format, same spirit as `paradigms.ts`'s own header explains for why it
// doesn't import `enumerate.ts`'s private parser: each layer reads the same compact string
// for its own purpose, and `learning/**` must not depend on `content/**`'s display layer.
// ---------------------------------------------------------------------------

function axisSet(
  selection: Readonly<Record<string, readonly string[]>>,
  axis: string,
): ReadonlySet<string> {
  return new Set(selection[axis] ?? [])
}

/** `noun:<sg|pl>:<case>` — axes `number`, `case`. */
function nounMatches(dimension: Dimension, selection: PracticeConfig['dimensionSelection']): boolean {
  const parts = dimension.split(':')
  return axisSet(selection, 'number').has(parts[1]!) && axisSet(selection, 'case').has(parts[2]!)
}

/**
 * `verb:<present|future>:<person>:<sg|pl>` or `verb:past:<person>:<sg|pl>:<gender>` or
 * `verb:imperative:<person>:<sg|pl>` — axes `tense`, `person`, `number`. Per the task text's
 * own scope for the VERB section ("времена, лица, числа" — no gender, no imperative
 * checkbox), `imperative` never matches (there is no `tense` value a user could check for
 * it) and `past`'s own `gender` segment is deliberately not filtered on at all — checking
 * "Прошедшее время" pulls in every gender variant of a matching (person, number) slot.
 */
function verbMatches(dimension: Dimension, selection: PracticeConfig['dimensionSelection']): boolean {
  const parts = dimension.split(':')
  const second = parts[1]!
  if (second === 'imperative') return false
  if (second === 'past') {
    const [, , person, number] = parts
    return (
      axisSet(selection, 'tense').has('past') &&
      axisSet(selection, 'person').has(person!) &&
      axisSet(selection, 'number').has(number!)
    )
  }
  const [, tense, person, number] = parts
  return (
    axisSet(selection, 'tense').has(tense!) &&
    axisSet(selection, 'person').has(person!) &&
    axisSet(selection, 'number').has(number!)
  )
}

/**
 * `adj:degree:<comparative|superlative>` (axis `degree`) or `adj:<sg|pl>:<gender>:<case>`
 * (axes `number`, `gender`, `case`) — two disjoint shapes, per `enumerate.ts`'s own ADJ
 * rules (positive-degree case forms vs. the comparative/superlative citation slot). Each
 * dimension only ever matches through one of the two branches below.
 */
function adjMatches(dimension: Dimension, selection: PracticeConfig['dimensionSelection']): boolean {
  const parts = dimension.split(':')
  if (parts[1] === 'degree') {
    return axisSet(selection, 'degree').has(parts[2]!)
  }
  const [, number, gender, caseValue] = parts
  return (
    axisSet(selection, 'number').has(number!) &&
    axisSet(selection, 'gender').has(gender!) &&
    axisSet(selection, 'case').has(caseValue!)
  )
}

function matchesConfig(descriptor: SkillDescriptor, config: PracticeConfig): boolean {
  if (descriptor.kind === 'vocab') return config.includeTranslation
  switch (config.section) {
    case 'NOUN':
      return nounMatches(descriptor.dimension, config.dimensionSelection)
    case 'VERB':
      return verbMatches(descriptor.dimension, config.dimensionSelection)
    case 'ADJ':
      return adjMatches(descriptor.dimension, config.dimensionSelection)
  }
}

// ---------------------------------------------------------------------------
// Deterministic seeded sample (mulberry32 + Fisher-Yates, truncated) — same construction as
// `learning/exercises/distractors.ts`'s private `seededSample`, intentionally re-declared
// here rather than imported (see this file's header).
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  const pool = [...items]
  const rng = mulberry32(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  return pool.slice(0, Math.max(0, n))
}

export interface BuildPracticeQueueInput {
  readonly config: PracticeConfig
  readonly candidateWords: readonly PracticeCandidateWord[]
  readonly seed: number
}

export function buildPracticeQueue(input: BuildPracticeQueueInput): PracticeQueuePlan {
  const { config, candidateWords } = input

  const matched: PracticeQueueItem[] = []
  const matchedWordIds = new Set<WordId>()

  for (const { wordId, descriptors } of candidateWords) {
    for (const descriptor of descriptors) {
      if (!matchesConfig(descriptor, config)) continue
      matched.push({
        skillId: descriptor.skillId,
        wordId,
        kind: descriptor.kind,
        dimension: descriptor.dimension,
      })
      matchedWordIds.add(wordId)
    }
  }

  const items = seededSample(matched, config.targetSize, input.seed)

  return {
    items,
    totalMatchingWordCount: matchedWordIds.size,
    totalMatchingSkillCount: matched.length,
  }
}
