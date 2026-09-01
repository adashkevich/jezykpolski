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
import type { SkillDescriptor } from '@/learning/skills/enumerate.ts'
import type { SkillId } from '@/learning/skills/skill-id.ts'
import type { SkillRecord } from '@/types/progress.ts'
import { pickFormDistractors, pickVocabDistractors } from './distractors.ts'
import type { ContentContext, Direction, Exercise, ExerciseInstance } from './exercise.types.ts'
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

function buildFormInput(skill: SkillDescriptor, ctx: ContentContext): Exercise {
  const entry = ctx.getWordEntry(skill.wordId)
  return {
    type: 'form-input',
    lemma: entry.lemma,
    hint: ctx.getPrimaryTranslation(skill.wordId),
    slot: skill.dimension,
    accepted: requireAcceptedAnswers(skill),
  }
}

function buildFormChoice(skill: SkillDescriptor, ctx: ContentContext, seed: number): Exercise {
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
): Exercise {
  switch (type) {
    case 'choice':
      return buildVocabChoice(skill, ctx, seed)
    case 'input':
      return buildVocabInput(skill, ctx)
    case 'self-assess':
      return buildSelfAssess(skill, ctx)
    case 'form-choice':
      return buildFormChoice(skill, ctx, seed)
    case 'form-input':
      return buildFormInput(skill, ctx)
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

export function generateExercise(
  skill: SkillDescriptor,
  srs: SkillRecord | undefined,
  ctx: ContentContext,
  seed: number,
  options: PickerOptions = {},
): ExerciseInstance {
  const type = pickExerciseType(skill, srs, options)
  const exercise = buildExercise(skill, type, ctx, seed)
  return {
    id: buildInstanceId(skill.skillId, seed),
    skillId: skill.skillId,
    exercise,
  }
}
