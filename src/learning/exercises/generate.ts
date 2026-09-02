/**
 * `generateExercise` (`spec/tasks/09-exercise-engine.md` step 3): skill + content -> a
 * concrete `ExerciseInstance`.
 *
 * Determinism by `seed` is the hard requirement (task text: "варианты ответа не должны
 * меняться при ре-рендере, и тесты должны быть воспроизводимы"). Every choice this module
 * makes — which type `picker.ts` returns (a pure function of `skill`/`srs`), which
 * distractors `distractors.ts` picks (seeded), where the correct answer lands among them
 * (derived from `seed`), and even `ExerciseInstance.id` itself — is a pure function of
 * `(skill, srs, ctx, seed)`. See the `buildInstanceId` comment below for why `id` is NOT
 * `crypto.randomUUID()` despite architecture.md §7.1 calling it a "uuid".
 */
import type { CaseValue } from '@/content/codec.ts'
import { enumerateSkills, type SkillDescriptor } from '@/learning/skills/enumerate.ts'
import {
  CASE_DISPLAY_ORDER,
  NUMBER_DISPLAY_ORDER,
  abbreviateNumber,
  type NounDimension,
} from '@/learning/skills/dimensions.ts'
import type { SkillId, WordId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { pickFormDistractors, pickVocabDistractors } from './distractors.ts'
import type {
  ContentContext,
  Direction,
  Exercise,
  ExerciseInstance,
  PromptMode,
  TableCell,
} from './exercise.types.ts'
import { NOUN_HINT_MODE_DEFAULT, resolvePromptMode, type HintMode } from './hint-mode.ts'
import { pickExerciseType, type PickedExerciseType, type PickerOptions } from './picker.ts'

/** Total options shown on a `choice`/`form-choice` exercise (1 correct + this many
 *  distractors) — matches every 4-option example in `spec/app-design.md` §6/§18. */
const DEFAULT_DISTRACTOR_COUNT = 3

// ---------------------------------------------------------------------------
// Direction — a vocab skill's dimension IS its direction (`vocab:pl-ru` / `vocab:ru-pl`,
// `learning/skills/enumerate.ts`), so there is nothing to infer beyond reading it back.
// ---------------------------------------------------------------------------

function directionOfVocabSkill(skill: SkillDescriptor): Direction {
  if (skill.dimension === 'vocab:pl-ru') return 'pl-ru'
  if (skill.dimension === 'vocab:ru-pl') return 'ru-pl'
  throw new Error(
    `generateExercise: expected a "vocab:*" dimension for a vocab-kind skill, got "${skill.dimension}"`,
  )
}

/** Deterministically interleaves `correct` into `distractors` at a seed-derived position
 *  (task 10 §4: "Позиция правильного ответа перемешивается тем же seed") without depending
 *  on anything from `distractors.ts` beyond its two documented exports — so a future task 10
 *  body swap there can never change how *this* module orders `options`. */
function insertAtSeededPosition(
  distractors: readonly string[],
  correct: string,
  seed: number,
): string[] {
  const index = Math.abs(seed) % (distractors.length + 1)
  return [...distractors.slice(0, index), correct, ...distractors.slice(index)]
}

function requireAcceptedAnswers(skill: SkillDescriptor): string[] {
  if (skill.acceptedAnswers.length === 0) {
    throw new Error(
      `generateExercise: morphological skill "${skill.skillId}" has no accepted answers ` +
        `(enumerateSkills should never have produced it without at least one)`,
    )
  }
  return [...skill.acceptedAnswers]
}

function requireParadigm(skill: SkillDescriptor, ctx: ContentContext) {
  const paradigm = ctx.getParadigm(skill.wordId)
  if (!paradigm) {
    throw new Error(
      `generateExercise: morphological skill "${skill.skillId}" targets a word with no paradigm`,
    )
  }
  return paradigm
}

// ---------------------------------------------------------------------------
// One builder per PickedExerciseType.
// ---------------------------------------------------------------------------

function buildVocabChoice(skill: SkillDescriptor, ctx: ContentContext, seed: number): Exercise {
  const direction = directionOfVocabSkill(skill)
  const entry = ctx.getWordEntry(skill.wordId)
  const primary = ctx.getPrimaryTranslation(skill.wordId)
  const correct = direction === 'pl-ru' ? primary : entry.lemma
  const prompt = direction === 'pl-ru' ? entry.lemma : primary
  const distractors = pickVocabDistractors(entry, direction, DEFAULT_DISTRACTOR_COUNT, seed)
  const options = insertAtSeededPosition(distractors, correct, seed)
  return { type: 'choice', direction, prompt, options, correct }
}

function buildVocabInput(skill: SkillDescriptor, ctx: ContentContext): Exercise {
  const direction = directionOfVocabSkill(skill)
  const entry = ctx.getWordEntry(skill.wordId)
  const primary = ctx.getPrimaryTranslation(skill.wordId)
  const prompt = direction === 'pl-ru' ? entry.lemma : primary
  // "для RU-ответов принимается любой из переводов данного значения" (architecture.md §7.3)
  // — only meaningful for pl-ru (the user types Russian); ru-pl has exactly one correct
  // Polish spelling, the lemma itself.
  const accepted = direction === 'pl-ru' ? ctx.getAllTranslations(skill.wordId) : [entry.lemma]
  return { type: 'input', direction, prompt, accepted }
}

function buildSelfAssess(skill: SkillDescriptor, ctx: ContentContext): Exercise {
  const entry = ctx.getWordEntry(skill.wordId)
  if (skill.kind === 'vocab') {
    const direction = directionOfVocabSkill(skill)
    const primary = ctx.getPrimaryTranslation(skill.wordId)
    const prompt = direction === 'pl-ru' ? entry.lemma : primary
    const answer = direction === 'pl-ru' ? primary : entry.lemma
    return { type: 'self-assess', prompt, answer }
  }
  const [answer] = requireAcceptedAnswers(skill)
  return { type: 'self-assess', prompt: `${entry.lemma} — ${skill.dimension}`, answer: answer! }
}

function buildFormInput(
  skill: SkillDescriptor,
  ctx: ContentContext,
  promptMode: PromptMode,
): Exercise {
  const entry = ctx.getWordEntry(skill.wordId)
  return {
    type: 'form-input',
    lemma: entry.lemma,
    hint: ctx.getPrimaryTranslation(skill.wordId),
    promptMode,
    slot: skill.dimension,
    accepted: requireAcceptedAnswers(skill),
  }
}

function buildFormChoice(
  skill: SkillDescriptor,
  ctx: ContentContext,
  seed: number,
  promptMode: PromptMode,
): Exercise {
  const entry = ctx.getWordEntry(skill.wordId)
  const accepted = requireAcceptedAnswers(skill)
  const correct = accepted[0]!
  const paradigm = requireParadigm(skill, ctx)
  const rawDistractors = pickFormDistractors(
    paradigm,
    skill.dimension,
    DEFAULT_DISTRACTOR_COUNT,
    seed,
  )
  // Belt-and-braces: a slot's own alternate accepted spelling (e.g. `aborcji`/`aborcyj`)
  // must never show up among the "wrong" options, even though `pickFormDistractors` is
  // already supposed to exclude the target slot's own forms.
  const distractors = rawDistractors.filter((form) => !accepted.includes(form))
  const options = insertAtSeededPosition(distractors, correct, seed)
  return {
    type: 'form-choice',
    lemma: entry.lemma,
    hint: ctx.getPrimaryTranslation(skill.wordId),
    promptMode,
    slot: skill.dimension,
    options,
    correct,
  }
}

function buildExercise(
  skill: SkillDescriptor,
  type: PickedExerciseType,
  ctx: ContentContext,
  seed: number,
  promptMode: PromptMode,
): Exercise {
  switch (type) {
    case 'choice':
      return buildVocabChoice(skill, ctx, seed)
    case 'input':
      return buildVocabInput(skill, ctx)
    case 'self-assess':
      return buildSelfAssess(skill, ctx)
    case 'form-choice':
      return buildFormChoice(skill, ctx, seed, promptMode)
    case 'form-input':
      return buildFormInput(skill, ctx, promptMode)
  }
}

/**
 * Deterministic, not `crypto.randomUUID()`. Architecture.md §7.1 calls `id` a "uuid" that
 * "живёт только внутри сессии" — but this task's acceptance requires
 * `generateExercise(..., seed)` to be byte-identical across calls with the same `seed`, and
 * a random UUID would violate that on every single call. `id` is instead a pure function of
 * `(skillId, seed)`: unique enough within one session (a session-runner is expected to vary
 * `seed` per attempt, per task 10 §3 — "Seed = хэш от skillId + reps"), and reproducible
 * for re-renders of the same question.
 */
function buildInstanceId(skillId: SkillId, seed: number): string {
  return `${skillId}::${seed}`
}

/**
 * `PickerOptions` (task 09) plus this task's own `hintMode` — kept as one options bag rather
 * than a second parameter so every existing call site that already passes `PickerOptions`
 * (e.g. `{ selfAssessOnReview: true }`) keeps compiling unchanged; `hintMode` only matters
 * for the `form-input`/`form-choice` branches `buildExercise` above dispatches to.
 */
export interface GenerateExerciseOptions extends PickerOptions {
  /** `spec/tasks/18-noun-exercises.md` step 2 / `spec/app-design.md` §9's "Подсказка"
   *  setting. Defaults to `NOUN_HINT_MODE_DEFAULT` ('lemma', the app-design mockup's
   *  pre-selected radio) when omitted — every caller that doesn't care about this setting
   *  (every test written before this task, any future non-noun exercise) gets Wariant A
   *  without having to know this option exists. */
  readonly hintMode?: HintMode
}

export function generateExercise(
  skill: SkillDescriptor,
  srs: SkillRecord | undefined,
  ctx: ContentContext,
  seed: number,
  options: GenerateExerciseOptions = {},
): ExerciseInstance {
  const type = pickExerciseType(skill, srs, options)
  const promptMode = resolvePromptMode(options.hintMode ?? NOUN_HINT_MODE_DEFAULT, seed)
  const exercise = buildExercise(skill, type, ctx, seed, promptMode)
  return {
    id: buildInstanceId(skill.skillId, seed),
    skillId: skill.skillId,
    exercise,
  }
}

// ---------------------------------------------------------------------------
// generateTableExercise — the `table` exercise (FR-62, task text step 4). Deliberately NOT
// wired through `pickExerciseType`/`generateExercise`: `picker.ts`'s own header already
// documents that `table` is "Practice-only... never returned here" — the picker only ever
// chooses between the daily-SRS recognition/recall pair. This is a separate entry point a
// Practice-only caller (`features/session-runner/hooks/useTablePracticeSession.ts`) calls
// directly, once, for a whole word — not once per skill.
//
// Built from `enumerateSkills` (the domain layer's own paradigm -> skill-slot expansion,
// `learning/skills/enumerate.ts`) rather than `content/paradigms.ts#buildNounTable` (the
// content layer's read-only display shaping for `NounFormsTable`): `learning/exercises/**`
// only ever talks to content through the synchronous `ContentContext` this module already
// depends on (`exercise.types.ts`'s own contract), so pulling in a second, content-layer
// table-building function here would cross that boundary for no benefit — `enumerateSkills`
// already computes exactly the same per-(number,case) accepted-answer lists `buildNounTable`
// would, just keyed by `Dimension` instead of by display row/column.
// ---------------------------------------------------------------------------

/** Every `noun:<sg|pl>:<case>` slot, in case-then-number order (matches
 *  `spec/app-design.md` §10's "Вариант C" mockup: each case row, sg column then pl column) —
 *  independent of whatever order `enumerateSkills` happens to produce its `Map` in. */
function nounTableSlots(): Array<{ readonly numberAbbrev: 'sg' | 'pl'; readonly caseValue: CaseValue }> {
  const slots: Array<{ numberAbbrev: 'sg' | 'pl'; caseValue: CaseValue }> = []
  for (const caseValue of CASE_DISPLAY_ORDER) {
    for (const number of NUMBER_DISPLAY_ORDER) {
      slots.push({ numberAbbrev: abbreviateNumber(number), caseValue })
    }
  }
  return slots
}

/**
 * Builds the full case x number `table` exercise for one NOUN word. Throws if the word has
 * no paradigm at all (mirrors `requireParadigm` above) — the caller (a "Тренировать
 * таблицей" button, `NounFormsTable.tsx`) only ever renders for words that do.
 */
export function generateTableExercise(wordId: WordId, ctx: ContentContext): Exercise {
  const entry = ctx.getWordEntry(wordId)
  const paradigm = ctx.getParadigm(wordId)
  if (!paradigm) {
    throw new Error(`generateTableExercise: word "${wordId}" has no paradigm`)
  }
  const descriptors = enumerateSkills(entry, paradigm)
  const acceptedByDimension = new Map(
    descriptors.filter((d) => d.kind === 'noun').map((d) => [d.dimension, d.acceptedAnswers]),
  )

  const cells: TableCell[] = nounTableSlots().map(({ numberAbbrev, caseValue }) => {
    const dimension: NounDimension = `noun:${numberAbbrev}:${caseValue}`
    return {
      slot: dimension,
      // "Первая строка (Mianownik) предзаполнена как опора" (task text step 4) — both the
      // sg and the pl nominative cell, per `spec/app-design.md` §10's mockup ("M. kobieta
      // kobiety", neither in an input box).
      prefilled: caseValue === 'nominative',
      accepted: acceptedByDimension.get(dimension) ?? [],
    }
  })

  return { type: 'table', lemma: entry.lemma, cells }
}
